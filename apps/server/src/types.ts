/** Hono のコンテキストに載せる値の型 */
export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
}

export interface AppEnv {
  Variables: {
    user: AuthUser;
  };
}
