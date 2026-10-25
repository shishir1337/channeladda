-- One conversation per buyer and seller, step 2 of 3: the merge.
--
-- Until now a buyer had one thread per listing with a seller. Here every
-- pair's threads become one: the oldest is kept, and the others' lines,
-- deals and read places move into it. Nothing anybody wrote is deleted:
-- only the emptied threads go, and each one's id is kept as an alias so
-- old links still open (on the listing that thread was about).
--
-- One DO block, so it is all or nothing whatever runs it. Safe to run
-- again: a second run finds every line already has its listing and no
-- pair with two threads, and changes nothing.
DO $$
DECLARE
  n_threads integer;
  n_pairs integer;
  n_lines integer;
  n_deals integer;
  n_closed integer;
  n_flagged integer;
BEGIN
  -- 1. Every line says which listing it is about: the one its thread was
  -- about, which until now was the only listing a thread could be about.
  UPDATE "Message" AS m
  SET "listingId" = c."listingId"
  FROM "Conversation" AS c
  WHERE m."conversationId" = c."id"
    AND m."listingId" IS NULL
    AND c."listingId" IS NOT NULL;

  -- 2. Where each thread goes: into the oldest of its pair's, by when it
  -- was opened, the id breaking a tie so a second run picks the same one.
  -- Only the threads that move are listed. The pair is the buyer and the
  -- seller in that order: the seller buying from the buyer stays apart.
  DROP TABLE IF EXISTS pg_temp.pair_chat_map;
  CREATE TEMP TABLE pair_chat_map AS
  SELECT t."id" AS old_id, t.new_id, t."listingId" AS listing_id
  FROM (
    SELECT c."id", c."listingId",
      first_value(c."id") OVER (
        PARTITION BY c."buyerId", c."sellerId"
        ORDER BY c."createdAt", c."id"
      ) AS new_id
    FROM "Conversation" AS c
  ) AS t
  WHERE t."id" <> t.new_id;

  SELECT count(*), count(DISTINCT new_id)
  INTO n_threads, n_pairs
  FROM pair_chat_map;

  -- Where each reader has read up to in the merged thread, worked out now,
  -- while every line is still in its own thread: the earliest of their
  -- places in the threads being merged, so nothing they had not read reads
  -- as read. A buyer or seller who never opened one of the threads has
  -- read it only up to just before its first line from somebody else.
  DROP TABLE IF EXISTS pg_temp.pair_chat_reads;
  CREATE TEMP TABLE pair_chat_reads AS
  WITH grp AS (
    -- Every thread of a pair being merged, the one kept included.
    SELECT DISTINCT map.new_id, c."id" AS thread_id,
      c."buyerId" AS buyer_id, c."sellerId" AS seller_id
    FROM pair_chat_map AS map
    JOIN "Conversation" AS c ON c."id" IN (map.old_id, map.new_id)
  ),
  marks AS (
    SELECT g.new_id, r."userId" AS user_id, r."readAt" AS read_at
    FROM grp AS g
    JOIN "ConversationRead" AS r ON r."conversationId" = g.thread_id
  ),
  unopened AS (
    SELECT g.new_id, side.user_id,
      (
        SELECT min(m."createdAt")
        FROM "Message" AS m
        WHERE m."conversationId" = g.thread_id
          AND m."senderId" IS NOT NULL
          AND m."senderId" <> side.user_id
      ) - interval '1 millisecond' AS read_at
    FROM grp AS g
    CROSS JOIN LATERAL (VALUES (g.buyer_id), (g.seller_id)) AS side(user_id)
    WHERE NOT EXISTS (
        SELECT 1 FROM "ConversationRead" AS r
        WHERE r."conversationId" = g.thread_id AND r."userId" = side.user_id
      )
      -- Somebody with no place in any of them has read none of it, which
      -- is what no marker already says.
      AND EXISTS (
        SELECT 1 FROM marks AS k
        WHERE k.new_id = g.new_id AND k.user_id = side.user_id
      )
  )
  SELECT places.new_id, places.user_id, min(places.read_at) AS read_at
  FROM (
    SELECT * FROM marks
    UNION ALL
    SELECT * FROM unopened WHERE read_at IS NOT NULL
  ) AS places
  GROUP BY places.new_id, places.user_id;

  -- 3. Old links: each merged thread's id, and the listing it was about.
  INSERT INTO "ConversationAlias" ("id", "conversationId", "listingId")
  SELECT map.old_id, map.new_id, map.listing_id
  FROM pair_chat_map AS map
  WHERE map.listing_id IS NOT NULL
  ON CONFLICT ("id") DO NOTHING;
  -- An alias already pointing at a thread merged now follows it.
  UPDATE "ConversationAlias" AS a
  SET "conversationId" = map.new_id
  FROM pair_chat_map AS map
  WHERE a."conversationId" = map.old_id;

  -- 4. The lines and the deals move into the thread kept.
  UPDATE "Message" AS m
  SET "conversationId" = map.new_id
  FROM pair_chat_map AS map
  WHERE m."conversationId" = map.old_id;
  GET DIAGNOSTICS n_lines = ROW_COUNT;

  UPDATE "Order" AS o
  SET "conversationId" = map.new_id
  FROM pair_chat_map AS map
  WHERE o."conversationId" = map.old_id;
  GET DIAGNOSTICS n_deals = ROW_COUNT;

  -- 5. The read places worked out above, on the thread kept.
  INSERT INTO "ConversationRead" ("conversationId", "userId", "readAt")
  SELECT r.new_id, r.user_id, r.read_at
  FROM pair_chat_reads AS r
  ON CONFLICT ("conversationId", "userId")
  DO UPDATE SET "readAt" = LEAST("ConversationRead"."readAt", EXCLUDED."readAt");

  -- 6. The thread kept carries what any of them had: the latest activity,
  -- a flag with its latest reason, a closure, and whoever on staff was
  -- handling one. GREATEST passes over nulls.
  UPDATE "Conversation" AS c
  SET "lastMessageAt" = GREATEST(c."lastMessageAt", agg.last_message_at),
      "flaggedAt" = GREATEST(c."flaggedAt", agg.flagged_at),
      "flagReason" = CASE
        WHEN agg.flagged_at IS NOT NULL
          AND (c."flaggedAt" IS NULL OR agg.flagged_at > c."flaggedAt")
        THEN agg.flag_reason
        ELSE c."flagReason"
      END,
      "closedAt" = GREATEST(c."closedAt", agg.closed_at),
      "staffId" = COALESCE(c."staffId", agg.staff_id)
  FROM (
    SELECT map.new_id,
      max(o."lastMessageAt") AS last_message_at,
      max(o."flaggedAt") AS flagged_at,
      (array_agg(o."flagReason" ORDER BY o."flaggedAt" DESC)
        FILTER (WHERE o."flaggedAt" IS NOT NULL))[1] AS flag_reason,
      max(o."closedAt") AS closed_at,
      (array_agg(o."staffId" ORDER BY o."createdAt", o."id")
        FILTER (WHERE o."staffId" IS NOT NULL))[1] AS staff_id
    FROM pair_chat_map AS map
    JOIN "Conversation" AS o ON o."id" = map.old_id
    GROUP BY map.new_id
  ) AS agg
  WHERE c."id" = agg.new_id;

  -- Closing or flagging now covers everything the two people say to each
  -- other, so staff are told how many merged conversations carry one.
  SELECT count(*) FILTER (WHERE c."closedAt" IS NOT NULL),
    count(*) FILTER (WHERE c."flaggedAt" IS NOT NULL)
  INTO n_closed, n_flagged
  FROM "Conversation" AS c
  WHERE c."id" IN (SELECT map.new_id FROM pair_chat_map AS map);

  -- 7. The emptied threads go, and their read markers with them.
  DELETE FROM "Conversation" AS c
  USING pair_chat_map AS map
  WHERE c."id" = map.old_id;

  RAISE NOTICE 'pair chat merge: % threads merged into % conversations; % lines and % deals moved; % merged conversations closed, % flagged',
    n_threads, n_pairs, n_lines, n_deals, n_closed, n_flagged;

  DROP TABLE pair_chat_map;
  DROP TABLE pair_chat_reads;
END
$$;
