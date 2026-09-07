import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { useCreateConversation } from "./api";

export function NewConversationModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const [participantIds, setParticipantIds] = useState<string[]>([""]);
  const [title, setTitle] = useState("");
  const createConversation = useCreateConversation();

  const otherCount = participantIds.filter((id) => id.trim()).length;
  const isGroup = otherCount > 1;

  function updateParticipant(index: number, value: string) {
    setParticipantIds((prev) => prev.map((p, i) => (i === index ? value : p)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const ids = participantIds.map((p) => p.trim()).filter(Boolean);
    const conversation = await createConversation.mutateAsync({
      participant_ids: ids,
      title: isGroup ? title : undefined,
    });
    setParticipantIds([""]);
    setTitle("");
    onCreated(conversation.id);
  }

  return (
    <Modal open={open} onClose={onClose} title="New conversation">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <p className="eyebrow mb-2 text-muted">Participants</p>
          <p className="mb-3 text-[0.8125rem] leading-relaxed text-faint">
            There is no member directory yet — paste the user ID a colleague shared with you. Your
            own ID is at the foot of the sidebar.
          </p>
          <div className="space-y-2">
            {participantIds.map((id, i) => (
              <div key={i} className="flex gap-2">
                <TextInput
                  value={id}
                  onChange={(e) => updateParticipant(i, e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  className="text-[0.8125rem] tracking-[0.02em] tnum"
                  required={i === 0}
                />
                {participantIds.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setParticipantIds((prev) => prev.filter((_, idx) => idx !== i))}
                    className="eyebrow shrink-0 px-2 hover:text-ink"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          {participantIds.length < 19 && (
            <Button
              type="button"
              variant="quiet"
              className="mt-3"
              onClick={() => setParticipantIds((prev) => [...prev, ""])}
            >
              Add another participant
            </Button>
          )}
        </div>

        {isGroup && (
          <TextInput
            id="conversationTitle"
            label="Group title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Regional pharmacists pilot"
            required
          />
        )}

        {createConversation.error != null && <ErrorBanner error={createConversation.error} />}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={createConversation.isPending}>
            Start
          </Button>
        </div>
      </form>
    </Modal>
  );
}
