"use client";

import { useActionState } from "react";
import { buttonClass, fieldErrorClass, labelClass, textareaClass } from "@/shared/ui/styles";
import { COMMENT_MAX } from "../domain/feedback";
import { addCommentAction, type CommentFormState } from "./feedback-actions";

/** The trainer's comment on a student's finished workout. */
export function CommentForm({ studentId, sessionId }: { studentId: number; sessionId: number }) {
  const [state, formAction, pending] = useActionState(addCommentAction, { value: "" } as CommentFormState);
  return (
    // React resets the form after the action; a rejected text comes back as the default value.
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <label htmlFor="comment-body" className={labelClass}>
        Add a comment
      </label>
      <textarea
        id="comment-body"
        name="body"
        required
        maxLength={COMMENT_MAX}
        defaultValue={state.value}
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "comment-body-error" : undefined}
        className={textareaClass}
      />
      {state.error && (
        <p id="comment-body-error" role="alert" className={fieldErrorClass}>
          {state.error}
        </p>
      )}
      <div>
        <button type="submit" disabled={pending} className={buttonClass("primary", "sm")}>
          {pending ? "Posting…" : "Post comment"}
        </button>
      </div>
    </form>
  );
}
