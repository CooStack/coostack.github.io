export function toggleFullscreen() {
    const host = document.querySelector(".viewer");
    if (!host) return;
    if (!document.fullscreenElement) host.requestFullscreen?.();
    else document.exitFullscreen?.();
}
