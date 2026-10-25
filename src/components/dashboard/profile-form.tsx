"use client";

import { CameraIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/app/user-menu";
import { TextArea, TextField } from "@/components/auth/fields";
import { BusyLabel } from "@/components/messages/chat-parts";
import { Button } from "@/components/ui/button";
import {
  ACCEPT,
  sendUpload,
  uploadRefusal,
} from "@/components/upload/image-upload";
import { BIO_MAX, type ProfileErrors } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { updateProfile } from "@/server/actions/profile";

/**
 * A member's name, country, photo and bio, edited in place.
 *
 * The photo goes up the moment it is chosen and shows at once; it is only
 * kept when Save is pressed, like the rest of the form.
 */
export function ProfileForm({
  name: savedName,
  country: savedCountry,
  image: savedImage,
  bio: savedBio,
  email,
}: {
  name: string;
  country: string | null;
  image: string | null;
  bio: string | null;
  email: string;
}) {
  const router = useRouter();
  const nameId = useId();
  const countryId = useId();
  const bioId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const [saved, setSaved] = useState({
    name: savedName,
    country: savedCountry ?? "",
    image: savedImage ?? "",
    bio: savedBio ?? "",
  });
  const [name, setName] = useState(saved.name);
  const [country, setCountry] = useState(saved.country);
  const [image, setImage] = useState(saved.image);
  const [bio, setBio] = useState(saved.bio);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty =
    name.trim() !== saved.name ||
    country.trim() !== saved.country ||
    bio.trim() !== saved.bio ||
    image !== saved.image;

  async function choose(file: File) {
    setNote(null);
    const refused = uploadRefusal(file);
    if (refused) {
      setErrors((current) => ({ ...current, image: refused }));
      return;
    }
    setUploading(true);
    try {
      const stored = await sendUpload(file, "avatar", () => {});
      setImage(stored.url);
      setErrors(({ image: _, ...rest }) => rest);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        image: error instanceof Error ? error.message : "Try again.",
      }));
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setNote(null);
        startTransition(async () => {
          const result = await updateProfile({ name, country, image, bio });
          if (result.ok) {
            setErrors({});
            setSaved({
              name: name.trim(),
              country: country.trim(),
              image,
              bio: bio.trim(),
            });
            setNote(result.message);
            router.refresh();
          } else {
            setErrors(result.errors);
          }
        });
      }}
    >
      <div className="flex items-center gap-4">
        <span className="relative">
          <Avatar
            name={name || savedName}
            image={image || null}
            className="size-20 text-xl"
          />
          {uploading ? (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-bg/70">
              <Loader2Icon
                aria-hidden="true"
                className="size-5 animate-spin text-fg"
              />
            </span>
          ) : null}
        </span>
        <div className="flex min-w-0 flex-col items-start gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <CameraIcon aria-hidden="true" />
              {image ? "Change photo" : "Add a photo"}
            </Button>
            {image ? (
              <Button
                type="button"
                size="sm"
                variant="danger-outline"
                disabled={uploading}
                onClick={() => setImage("")}
              >
                Remove
              </Button>
            ) : null}
          </div>
          <p
            className={cn(
              "text-xs",
              errors.image ? "text-danger" : "text-subtle",
            )}
          >
            {errors.image ??
              "A clear photo of you. PNG, JPEG, WebP or GIF, up to 8MB."}
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void choose(file);
          }}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <TextField
          id={nameId}
          name="name"
          label="Your name"
          hint="Shown on your listings and in chats."
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
          autoComplete="name"
          maxLength={50}
          required
        />
        <TextField
          id={countryId}
          name="country"
          label="Country"
          hint="Shown on your public page."
          value={country}
          onChange={(event) => setCountry(event.target.value)}
          error={errors.country}
          placeholder="India"
          autoComplete="country-name"
          maxLength={56}
        />
      </div>

      <TextArea
        id={bioId}
        name="bio"
        label="Bio"
        hint="A few lines about you and what you sell. Buyers read this on your public page before they buy. No links, emails or phone numbers."
        value={bio}
        onChange={(event) => setBio(event.target.value)}
        error={errors.bio}
        placeholder="I build and sell faceless finance channels. Every handover done within a day."
        rows={4}
        maxLength={BIO_MAX}
        className="mt-4"
      />
      <p
        aria-live="polite"
        className={cn(
          "mt-1.5 text-right text-xs tabular-nums",
          bio.length >= BIO_MAX ? "text-danger" : "text-subtle",
        )}
      >
        {bio.length}/{BIO_MAX}
      </p>

      {/* Changed on the security page, which asks for the password first;
          the link opens that form ready to fill. */}
      <p className="mt-4 flex flex-wrap items-center gap-x-2 text-[0.8125rem] text-muted">
        <span className="min-w-0">
          Email <span className="font-medium break-all text-fg">{email}</span>
        </span>
        <Link
          href="/dashboard/security#change-email"
          aria-label="Change your email"
          className="-my-3 inline-flex min-h-11 items-center rounded-md font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg pointer-fine:-my-1 pointer-fine:min-h-6"
        >
          Change
        </Link>
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          type="submit"
          size="md"
          variant={dirty ? "primary" : "secondary"}
          disabled={pending || uploading || !dirty}
        >
          <BusyLabel
            busy={pending}
            idle={dirty ? "Save changes" : "Saved"}
            working="Saving…"
          />
        </Button>
        {note ? (
          <p role="status" className="text-xs text-verified">
            {note}
          </p>
        ) : null}
      </div>
    </form>
  );
}
