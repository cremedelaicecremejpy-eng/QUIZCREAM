export const userPublicSelect = {
  id: true,
  email: true,
  username: true,
  wins: true,
  losses: true,
  isPro: true,
  emailVerified: true,
  googleId: true,
  createdAt: true
};

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    wins: user.wins,
    losses: user.losses,
    isPro: user.isPro,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt
  };
}
