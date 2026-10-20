import {useCallback, useEffect, useRef, useState} from "react";
import type {Clip, ProjectDocument} from "@ajiunotes/contracts";
import {commitHistory, createHistory, deleteClip, duplicateClip, redoHistory, replaceClip, undoHistory, type EditorHistory} from "@ajiunotes/editor-core";

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

const draftKey = (projectId: string) => `ajiunotes.unsaved-project.${projectId}`;

const loadLocalDraft = (initial: ProjectDocument): {project: ProjectDocument; restored: boolean} => {
  try {
    const raw = window.localStorage.getItem(draftKey(initial.projectId));
    if (!raw) return {project: initial, restored: false};
    const candidate = JSON.parse(raw) as ProjectDocument;
    const candidateTime = Date.parse(candidate.updatedAt);
    const initialTime = Date.parse(initial.updatedAt);
    if (candidate.projectId !== initial.projectId || !Number.isFinite(candidateTime) || candidateTime < initialTime) {
      window.localStorage.removeItem(draftKey(initial.projectId));
      return {project: initial, restored: false};
    }
    return {project: candidate, restored: JSON.stringify(candidate) !== JSON.stringify(initial)};
  } catch {
    window.localStorage.removeItem(draftKey(initial.projectId));
    return {project: initial, restored: false};
  }
};

const writeLocalDraft = (project: ProjectDocument) => {
  try {window.localStorage.setItem(draftKey(project.projectId), JSON.stringify(project));} catch { /* 浏览器空间不足时仍保留内存历史 */ }
};

const removeLocalDraft = (projectId: string) => {
  try {window.localStorage.removeItem(draftKey(projectId));} catch { /* 无需阻断保存 */ }
};

export const useProjectEditor = (
  initial: ProjectDocument,
  persist: (project: ProjectDocument, action: string) => Promise<{revision: number}>,
) => {
  const restoredRef = useRef<{project: ProjectDocument; restored: boolean} | undefined>(undefined);
  if (!restoredRef.current) restoredRef.current = loadLocalDraft(initial);
  const startingProject = restoredRef.current.project;
  const [history, setHistory] = useState<EditorHistory>(() => createHistory(startingProject));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(restoredRef.current.restored ? "dirty" : "saved");
  const [saveError, setSaveError] = useState<string>();
  const [savedRevision, setSavedRevision] = useState<number>();
  const revisionRef = useRef(0);
  const persistedRef = useRef(JSON.stringify(initial));
  const latestProjectRef = useRef(startingProject);
  const latestSerializedRef = useRef(JSON.stringify(startingProject));
  const actionRef = useRef(restoredRef.current.restored ? "恢复本机未保存草稿" : "打开项目");

  const commit = useCallback((project: ProjectDocument, action: string) => {
    const now = new Date().toISOString();
    setHistory((current) => {
      const next = commitHistory(current, project, action, now);
      if (next !== current) {
        actionRef.current = action;
        revisionRef.current += 1;
        setSaveStatus("dirty");
      }
      return next;
    });
  }, []);

  const updateClip = useCallback((clip: Clip, action: string) => {
    commit(replaceClip(history.present, clip), action);
  }, [commit, history.present]);

  const removeClip = useCallback((clipId: string) => commit(deleteClip(history.present, clipId), "删除对象"), [commit, history.present]);
  const copyClip = useCallback((clipId: string) => {
    const newId = `${clipId}-copy-${Date.now().toString(36)}`;
    commit(duplicateClip(history.present, clipId, newId), "复制对象");
    return newId;
  }, [commit, history.present]);

  const undo = useCallback(() => {
    setHistory((current) => {
      const next = undoHistory(current);
      if (next !== current) {actionRef.current = "撤销"; revisionRef.current += 1; setSaveStatus("dirty");}
      return next;
    });
  }, []);
  const redo = useCallback(() => {
    setHistory((current) => {
      const next = redoHistory(current);
      if (next !== current) {actionRef.current = "重做"; revisionRef.current += 1; setSaveStatus("dirty");}
      return next;
    });
  }, []);

  const saveNow = useCallback(async () => {
    const project = latestProjectRef.current;
    const serialized = JSON.stringify(project);
    if (serialized === persistedRef.current) {removeLocalDraft(project.projectId); setSaveError(undefined); setSaveStatus("saved"); return;}
    setSaveStatus("saving");
    setSaveError(undefined);
    try {
      const result = await persist(project, actionRef.current);
      persistedRef.current = serialized;
      setSavedRevision(result.revision);
      if (latestSerializedRef.current === serialized) {
        removeLocalDraft(project.projectId);
        setSaveStatus("saved");
      } else {
        writeLocalDraft(latestProjectRef.current);
        setSaveStatus("dirty");
      }
    } catch (cause) {
      writeLocalDraft(latestProjectRef.current);
      setSaveError(cause instanceof Error ? cause.message : "本地服务暂时不可用");
      setSaveStatus("error");
    }
  }, [persist]);

  useEffect(() => {
    latestProjectRef.current = history.present;
    latestSerializedRef.current = JSON.stringify(history.present);
    if (latestSerializedRef.current !== persistedRef.current) writeLocalDraft(history.present);
  }, [history.present]);

  useEffect(() => {
    if (saveStatus !== "dirty") return;
    const expectedRevision = revisionRef.current;
    const timer = window.setTimeout(() => {
      if (expectedRevision === revisionRef.current) void saveNow();
    }, 750);
    return () => window.clearTimeout(timer);
  }, [saveNow, saveStatus]);

  useEffect(() => {
    if (saveStatus !== "error") return;
    const timer = window.setTimeout(() => {void saveNow();}, 4_000);
    return () => window.clearTimeout(timer);
  }, [saveNow, saveStatus]);

  useEffect(() => {
    const retry = () => {if (latestSerializedRef.current !== persistedRef.current) void saveNow();};
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [saveNow]);

  return {
    project: history.present,
    lastAction: history.lastAction,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    saveStatus,
    saveError,
    localDraftRestored: restoredRef.current.restored,
    savedRevision,
    commit,
    updateClip,
    removeClip,
    copyClip,
    undo,
    redo,
    saveNow,
  };
};
