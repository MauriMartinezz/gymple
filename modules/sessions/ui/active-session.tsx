import { deleteSetAction, discardSessionAction, editSetAction, logSetAction } from "./actions";
import { ActiveSessionContent } from "./active-session-view";
import type { ActiveSessionView } from "./session-view";

const actions = {
  logSet: logSetAction,
  editSet: editSetAction,
  deleteSet: deleteSetAction,
  discard: discardSessionAction,
};

/** The signed-in workout in progress, wired to the server actions. */
export function ActiveSession({ view }: { view: ActiveSessionView }) {
  return <ActiveSessionContent view={view} actions={actions} finishHref="/sessions/active/finish" />;
}
