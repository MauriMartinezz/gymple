import { buttonClass } from "@/shared/ui/styles";
import { deleteCommentAction } from "./feedback-actions";

export interface CommentView {
  id: number;
  trainerName: string;
  date: string;
  body: string;
}

/**
 * Trainers' comments on a workout. With `deletable`, each comment gets a
 * delete button (the trainer's own comments in the trainer's view).
 */
export function CommentList({
  comments,
  deletable,
}: {
  comments: CommentView[];
  deletable?: { studentId: number; sessionId: number };
}) {
  return (
    <ul className="divide-y divide-border">
      {comments.map((comment) => (
        <li key={comment.id} className="flex items-start gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-fg-subtle">
              <span className="font-medium text-fg">{comment.trainerName}</span> · {comment.date}
            </p>
            <p className="mt-1 whitespace-pre-line text-fg">{comment.body}</p>
          </div>
          {deletable && (
            <form action={deleteCommentAction}>
              <input type="hidden" name="studentId" value={deletable.studentId} />
              <input type="hidden" name="sessionId" value={deletable.sessionId} />
              <input type="hidden" name="commentId" value={comment.id} />
              <button type="submit" className={buttonClass("ghost", "sm")}>
                Delete<span className="sr-only"> comment from {comment.date}</span>
              </button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
