import { useEffect } from "react";

import { useScene } from "../context/SceneContext";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

/** Toggle simulation play/pause with Space (ignored while typing in form fields). */
export function usePlaybackKeyboard() {
  const { playing, setPlaying } = useScene();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      if (e.repeat || isEditableTarget(e.target)) return;
      e.preventDefault();
      setPlaying(!playing);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [playing, setPlaying]);
}
