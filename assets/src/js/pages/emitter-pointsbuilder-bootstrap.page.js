import {
  initStandaloneOrEmbeddedReturn,
  installStoragePrefixPatch,
  setOptionalStorage,
} from "../shared/storage-prefix-bootstrap.js";

window.__PB_STORAGE_PREFIX = "egpb_";

installStoragePrefixPatch({
  prefix: String(window.__PB_STORAGE_PREFIX || ""),
  guardProperty: "__egpbPatched",
  keyPattern: /^pb_/,
});

initStandaloneOrEmbeddedReturn({
  backButtonId: "btnBackEmitterGenerator",
  messageType: "egpb-builder-return",
  defaultReturnPage: "../../generator.html",
  queryReturnKey: "return",
  writeStorage(params, storage) {
    const emitterId = params.get("emit") || "";
    setOptionalStorage(storage, "egpb_return_emitter_v1", emitterId);
  },
});
