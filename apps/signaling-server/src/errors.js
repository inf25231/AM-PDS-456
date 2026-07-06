/**
 * Detects if room does not exist
 * @param {unknown} error - The error thrown by a LiveKit call.
 * @returns {boolean} True if the message looks like a missing-room error.
 */
export function isRoomMissingError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('not found') ||
    message.includes('room does not exist') ||
    message.includes('unknown room')
  );
}
