export function isRoomMissingError(error) {
    const message = String(error?.message || '').toLowerCase();
    return (
        message.includes('not found') ||
        message.includes('room does not exist') ||
        message.includes('unknown room')
    );
}

