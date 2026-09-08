import { Link } from "react-router-dom";
import { MessageCircle, ArrowUpRight } from "lucide-react";
import { useUnreadMessages } from "./api";

export function MessageNotifications() {
  const { data, error } = useUnreadMessages();
  if (error)
    return (
      <p className="mb-5 text-sm text-muted">
        Message notifications couldn’t refresh.{" "}
        <Link to="/messaging" className="font-semibold text-blue-700">
          Check your inbox →
        </Link>
      </p>
    );
  if (!data?.count) return null;
  return (
    <section aria-label="Unread messages" className="mb-6 rounded-xl bg-blue-50 p-5">
      <div className="flex items-start gap-3">
        <MessageCircle className="mt-1 shrink-0 text-blue-700" size={22} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 role="status" aria-live="polite" className="font-semibold text-slate-900">
            You have {data.count} unread {data.count === 1 ? "message" : "messages"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Your peers have been in touch. Open a conversation to read and reply.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.items.slice(0, 3).map((item) => (
              <Link
                key={item.conversation_id}
                to={`/messaging/${item.conversation_id}`}
                className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-blue-700 shadow-sm hover:bg-blue-100"
              >
                {item.title} · {item.count} unread
              </Link>
            ))}
          </div>
        </div>
        <Link
          to="/messaging"
          className="flex shrink-0 items-center gap-1 text-sm font-semibold text-blue-700"
        >
          Inbox <ArrowUpRight size={16} />
        </Link>
      </div>
    </section>
  );
}
