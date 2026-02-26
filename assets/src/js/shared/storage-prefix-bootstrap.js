import { addDomReadyListener, postMessageSafe } from "./events.js";
import { safeStorageSet } from "./storage.js";

export function installStoragePrefixPatch({ prefix, guardProperty, keyPattern = /^pb_/ }) {
  const safePrefix = String(prefix || "");
  const proto = Storage.prototype;
  if (proto[guardProperty]) return;

  const rawGet = proto.getItem;
  const rawSet = proto.setItem;
  const rawRemove = proto.removeItem;

  function mapKey(key) {
    const raw = String(key ?? "");
    return keyPattern.test(raw) ? `${safePrefix}${raw}` : raw;
  }

  proto.getItem = function getItemPatched(key) {
    return rawGet.call(this, mapKey(key));
  };
  proto.setItem = function setItemPatched(key, value) {
    return rawSet.call(this, mapKey(key), value);
  };
  proto.removeItem = function removeItemPatched(key) {
    return rawRemove.call(this, mapKey(key));
  };

  Object.defineProperty(proto, guardProperty, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

export function hideRealtimeKotlinControls() {
  document.querySelector(".layout")?.classList.add("kotlin-hidden");
  const realtimeKotlin = document.getElementById("chkRealtimeKotlin");
  const realtimeLabel = realtimeKotlin?.closest("label");
  if (realtimeLabel) realtimeLabel.style.display = "none";
  if (realtimeKotlin) {
    realtimeKotlin.checked = false;
    realtimeKotlin.disabled = true;
  }
}

export function initStandaloneOrEmbeddedReturn({
  backButtonId,
  messageType,
  defaultReturnPage,
  queryReturnKey,
  writeStorage,
}) {
  addDomReadyListener(() => {
    hideRealtimeKotlinControls();

    const back = document.getElementById(backButtonId);
    if (!back) return;

    const params = new URLSearchParams(window.location.search);
    const returnPage = params.get(queryReturnKey) || defaultReturnPage;

    back.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (window.parent && window.parent !== window) {
        postMessageSafe(window.parent, { type: messageType }, "*");
        return;
      }

      try {
        writeStorage(params, localStorage);
      } catch {
        // Ignore storage failure and continue navigation.
      }
      window.location.href = `./${returnPage}`;
    });
  });
}

export function setOptionalStorage(storage, key, value) {
  if (!value) return;
  safeStorageSet(storage, key, String(value));
}
