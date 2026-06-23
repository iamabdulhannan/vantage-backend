/** The authenticated principal attached to each request by the JWT strategy. */
export interface Principal {
  userId: string;
  companyId: string;
  email: string;
}
