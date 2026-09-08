# Learning, uploads and profile covers

Apply `db/migrations/000012_media_and_covers.up.sql` once to the deployment database before deploying this release. Migration 000011 must already be present for the email/password release. Migration 000012 was applied successfully to both the local preview and the Render production database on September 8, 2026.

## Included

- Learning opens in an in-platform player view, with a library list, saved/completed controls and focus mode. YouTube watch/share/embed/shorts/live URLs are supported. HTTPS MP4/WebM recording URLs use the native video player. Sample records and unsupported URLs show an explanation rather than opening an external page. This is a lesson library, not a sequenced course/assessment or accreditation system.
- Feed and notice composers can upload JPEG/PNG images and MP4/WebM video clips. Up to four attachments fit in the composer. Media-only feed posts are supported. Videos play inline with controls; they do not autoplay.
- Notice body toolbar supports bold, italic, highlighting, headings, subheadings and bullet lists, with an edit/preview toggle. Formatting is stored as a small Markdown subset and rendered as React text/elements; raw HTML is not executed.
- Profile cover images can be replaced or removed independently of avatars. Photos are normalized to JPEG and stored in PostgreSQL. Covers are center-cropped to 1024×320; avatars to 512×512.

## Storage and access

Uploads are bounded to 20 MB each and 100 MB stored per member. Image content is decoded, bounded to 4096 pixels per dimension, then re-encoded to strip metadata. MIME sniffing rejects unsupported files. Video containers are not transcoded or fully codec-validated: playback depends on the browser's supported codecs. Uploads have a two-minute request deadline for slower connections.

`media_objects` stores bytes in PostgreSQL to avoid relying on ephemeral Render disk. This is suitable for a limited pilot with short clips. Before broader video usage, move storage to an object store with direct multipart upload, transcoding, delivery URLs and lifecycle cleanup. Monitor database size and backups; a free database can fill quickly. Removing an attachment from an unsent draft removes its reference, but the uploaded object remains and counts against quota. Unreferenced-upload cleanup is not implemented yet.

Media downloads require a bearer session. Draft objects are accessible only to their uploader. Other members need an existing publication reference whose author matches the uploader. Post access checks hidden-post state; notice access permits published notices or publisher administrators reviewing drafts. This matches the current public noticeboard model; delivery audience targeting is not a document-view ACL. Withdrawn notice media is not available to ordinary non-owner viewers.

No tokens are put into image/video URLs. The browser fetches authenticated bytes and revokes its temporary object URL when the attachment unmounts. The current video UI downloads the bounded clip before playback; it is not adaptive streaming.

YouTube owners can prohibit embedding or impose playback restrictions. Those restrictions cannot be bypassed. A publisher must choose an embeddable recording. See [YouTube embedding documentation](https://developers.google.com/youtube/player_parameters).

## Verification

`make check` passes. PostgreSQL integration tests cover media persistence, image validation, authentication and draft/publication access. `web/scripts/media-learning-check.mjs` verifies the learning player, completion controls, notice formatting preview, media-only post submission and profile-cover upload/reload with a mocked API. Real third-party playback and production hosting still require deployment checks.
