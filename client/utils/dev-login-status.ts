export async function getDevLoginStatus(): Promise<{ enabled: boolean }> {
  const response = await fetch("/auth/login/dev/status");
  if (!response.ok) {
    throw new Error(`Unable to check sign-in mode (${response.status})`);
  }
  return response.json();
}
