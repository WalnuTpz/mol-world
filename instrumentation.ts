export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertPrivateMediaStorage } = await import("./lib/storageLayout");
    await assertPrivateMediaStorage();
    const { recoverMediaOperations } = await import("./lib/mediaFiles");
    await recoverMediaOperations();
  }
}
