/** The authenticated user, as the rest of the app sees it. */
export interface CurrentUser {
  id: number;
  email: string;
  name: string;
}
