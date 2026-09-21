import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import type {ChangeEvent, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent} from "react";
import {Player, type PlayerRef} from "@remotion/player";
import {prefetch, staticFile} from "remotion";
import {CARD_SFX_PRESETS} from "@ajiunotes/contracts";
import type {Asset, Clip, MotionPreset, ProjectDocument, Track} from "@ajiunotes/contracts";
import {clampCanvasPosition, clearCaptionClips, clearMotionClips, fitClipToAssetAspect, fitProjectDurationToContent, isClipWithinSafeArea, moveClip, replaceClip, resizeClipFromHandle, rippleTrimProject, trimClipEnd, trimClipStart, updateClipTransform, type CanvasResizeHandle} from "@ajiunotes/editor-core";
import {EditorComposition, resolveCompositionMetadata, type EditorInputProps} from "@ajiunotes/video-engine";
import {api, type Health, type ProjectBundle, type ProjectSummary} from "./api";
import {createCommunityMotionPresets} from "./community-motion-presets";
import {AlertIcon, ArrowLeftIcon, CheckIcon, EyeIcon, FilmIcon, FolderIcon, GridIcon, LayersIcon, LockIcon, SearchIcon, SparkIcon, UploadIcon} from "./icons";
import {useProjectEditor} from "./useProjectEditor";
import {ContentPanel, MotionDesignerPanel, MotionLibraryPanel, RecordingPanel, ShotNodes, type MotionDesignDraft, type MotionDesignSeed, type RecordingInsert} from "./workbench-panels";
import "./recovery.css";

const frameTime = (frame: number, fps: number) => {
  const seconds = frame / fps;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${rest.toFixed(2).padStart(5, "0")}`;
};

const typeLabel: Record<Clip["type"], string> = {video: "视频", image: "图片", audio: "音频", caption: "字幕", template: "动效"};
const statusLabel = (status: ProjectDocument["status"]) => status === "approved_for_render" ? "已批准渲染" : "候选草稿";

const assetTypeName: Record<Asset["type"], string> = {video: "视频素材", image: "图片素材", audio: "音频素材", subtitle: "字幕文件", font: "字体文件", document: "文档素材"};

const normalizeImportedMaterialLayout = (project: ProjectDocument): ProjectDocument => ({
  ...project,
  clips: project.clips.map((clip) => {
    if (clip.props.fullScreenFocus === true && (clip.type === "image" || clip.type === "video" || clip.componentId?.endsWith("proof-frame") || clip.componentId?.endsWith("demo-focus"))) {
      const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
      const restoreTransform = clip.props.focusRestoreTransform;
      const restoreRatio = restoreTransform && typeof restoreTransform === "object" && !Array.isArray(restoreTransform)
        ? Number((restoreTransform as Record<string, unknown>).width) / Math.max(1, Number((restoreTransform as Record<string, unknown>).height))
        : clip.transform.width / Math.max(1, clip.transform.height);
      const sourceRatio = asset?.width && asset.height ? asset.width / asset.height : restoreRatio;
      const canvasRatio = project.settings.width / project.settings.height;
      const width = sourceRatio >= canvasRatio ? project.settings.width : project.settings.height * sourceRatio;
      const height = sourceRatio >= canvasRatio ? project.settings.width / sourceRatio : project.settings.height;
      return {
        ...clip,
        transform: {...clip.transform, x: (project.settings.width - width) / 2, y: (project.settings.height - height) / 2, width, height, scale: 1, rotation: 0},
        props: {...clip.props, fit: "fill", focusTransitionFrames: Math.min(45, Math.max(24, Number(clip.props.focusTransitionFrames ?? 24)))},
      };
    }
    if (clip.props.importedMaterial !== true || clip.props.aspectInitialized === true || (clip.type !== "image" && clip.type !== "video")) return clip;
    const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
    const fitted = fitClipToAssetAspect(clip, asset?.width, asset?.height, project.settings.width, project.settings.height);
    const hasAspect = Boolean(asset?.width && asset.height);
    return {
      ...fitted,
      props: {
        ...fitted.props,
        fit: "fill",
        ...(hasAspect ? {aspectInitialized: true} : {}),
        tiltY: Number(fitted.props.tiltY ?? 0),
        tiltX: Number(fitted.props.tiltX ?? 0),
      },
    };
  }),
});

const sourceBaseName = (sourcePath: string) => {
  const name = decodeURIComponent(sourcePath.split("/").at(-1) ?? sourcePath).replace(/\.[^.]+$/, "");
  return name.replace(/^\d+[_-]?/, "").replace(/[_-]+/g, " ").trim();
};

const assetPresentation = (asset: Asset): {name: string; detail: string; group: "support" | "original" | "project"; highlighted: boolean} => {
  const isOriginal = asset.id.startsWith("source-") || asset.id.startsWith("asset-original-") || asset.sourcePath.includes("/assets/original/");
  if (isOriginal) return {name: sourceBaseName(asset.sourcePath) || "口播原片", detail: "独立保留，可在时间线裁切与排序", group: "original", highlighted: false};
  if (asset.type === "subtitle" || asset.type === "font" || asset.type === "document") {
    return {name: sourceBaseName(asset.sourcePath) || assetTypeName[asset.type], detail: `${assetTypeName[asset.type]}｜项目辅助文件`, group: "project", highlighted: false};
  }
  return {name: sourceBaseName(asset.sourcePath) || assetTypeName[asset.type], detail: `${assetTypeName[asset.type]}｜可拖入画布或时间线`, group: "support", highlighted: true};
};

const Empty = ({message}: {message: string}) => <div className="empty-state"><SparkIcon/><span>{message}</span></div>;

const ProjectCenter = ({projects, health, loading, error, onOpen, onRefresh, onRename, onDelete}: {
  projects: ProjectSummary[];
  health: Health | undefined;
  loading: boolean;
  error: string | undefined;
  onOpen: (id: string) => void;
  onRefresh: () => void;
  onRename: (project: ProjectSummary, name: string) => Promise<void>;
  onDelete: (project: ProjectSummary) => void;
}) => {
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [renamingId, setRenamingId] = useState<string>();
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const startRename = (project: ProjectSummary) => {
    setRenamingId(project.projectId);
    setRenameValue(project.name);
  };
  const cancelRename = () => {
    setRenamingId(undefined);
    setRenameValue("");
  };
  const submitRename = async (project: ProjectSummary) => {
    const name = renameValue.trim();
    if (!name) {
      window.alert("项目名称不能为空");
      return;
    }
    if (name === project.name) {
      cancelRename();
      return;
    }
    setRenaming(true);
    try {
      await onRename(project, name);
      cancelRename();
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : "项目重命名失败");
    } finally {
      setRenaming(false);
    }
  };
  const importVideos = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setImporting(true);
    try {
      const imported = await api.createProjectFromMedia(files);
      await onRefresh();
      onOpen(imported.projectId);
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : "视频项目创建失败");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };
  return (
    <main className="project-center">
      <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
      <header className="center-header">
        <div className="brand"><div className="brand-mark">A9</div><div><strong>A9 可视化编导台</strong><span>REMOTION VISUAL WORKBENCH</span></div></div>
        <div className="system-pill"><span className={health?.status === "ok" ? "status-dot online" : "status-dot"}/>{health?.status === "ok" ? "本地引擎在线" : "正在连接引擎"}</div>
      </header>
      <section className="hero">
        <div className="eyebrow"><SparkIcon/> 可以用 Codex 在编导台内增加动效</div>
        <h1><span>从镜头节点</span><em>到剪辑动效</em><span>在一张工作台推进。</span></h1>
        <div className="hero-actions">
          <button className="primary-button" onClick={() => mediaInputRef.current?.click()} disabled={importing}><UploadIcon/>{importing ? "正在创建…" : "导入一段或多段视频新建项目"}</button>
          <button className="ghost-button" onClick={onRefresh}>刷新项目</button>
          <input ref={mediaInputRef} hidden multiple type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" onChange={importVideos}/>
        </div>
      </section>
      <section className="projects-section">
        <div className="section-heading"><div><span>PROJECT CENTER</span><h2>最近项目</h2></div><div className="engine-badges"><span>{health?.ffmpeg ? <CheckIcon/> : <AlertIcon/>} FFmpeg</span><span>{health?.ffprobe ? <CheckIcon/> : <AlertIcon/>} ffprobe</span></div></div>
        {error ? <div className="error-banner"><AlertIcon/>{error}</div> : null}
        {loading ? <Empty message="正在读取本地项目…"/> : (
          <div className="project-grid">
            {projects.map((project, index) => (
              <article key={project.projectId} data-testid={`project-${project.projectId}`} className="project-card" role="button" tabIndex={0} onClick={() => onOpen(project.projectId)} onKeyDown={(event) => {if (event.key === "Enter" || event.key === " ") {event.preventDefault(); onOpen(project.projectId);}}}>
                <div className="project-thumb">
                  <div className="thumb-grid"/><div className="thumb-card"><span>PROJECT {String(index + 1).padStart(2, "0")}</span><strong>{project.name}</strong><small>{project.orientation === "horizontal" ? "16:9 横屏" : "9:16 竖屏"}</small></div>
                </div>
                <div className="project-info"><div><strong>{project.name}</strong><span>{statusLabel(project.status)} · {project.autosaveCount} 个恢复点</span></div><div className="asset-count"><span className={project.readyAssets === project.totalAssets ? "ready" : "warn"}/>{project.readyAssets}/{project.totalAssets} 素材</div></div>
                {renamingId === project.projectId ? (
                  <div className="project-rename-form" onClick={(event) => event.stopPropagation()}>
                    <input
                      autoFocus
                      aria-label={`重命名 ${project.name}`}
                      value={renameValue}
                      disabled={renaming}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void submitRename(project);
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          cancelRename();
                        }
                      }}
                    />
                    <button disabled={renaming} onClick={() => void submitRename(project)}>{renaming ? "保存中…" : "保存"}</button>
                    <button disabled={renaming} onClick={cancelRename}>取消</button>
                  </div>
                ) : (
                  <div className="project-actions">
                    <button onClick={(event) => {event.stopPropagation(); startRename(project);}}>重命名</button>
                    <button className="danger" onClick={(event) => {event.stopPropagation(); onDelete(project);}}>删除项目</button>
                  </div>
                )}
              </article>
            ))}
            {projects.length === 0 ? <Empty message="还没有项目，可直接导入一段或多段视频"/> : null}
          </div>
        )}
      </section>
    </main>
  );
};

const AssetRow = ({asset, status, onUpload, onInsert}: {asset: Asset; status: "ready" | "missing" | "blocked"; onUpload: (file: File) => void; onInsert: (asset: Asset) => void}) => {
  const presentation = assetPresentation(asset);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={`asset-row ${presentation.highlighted ? "asset-row-highlighted" : ""}`} data-testid={`asset-row-${asset.id}`} draggable={status === "ready"} title={asset.id} onDragStart={(event) => {event.dataTransfer.setData("application/x-ajiunotes-asset", asset.id); event.dataTransfer.effectAllowed = "copy";}}>
      <div className={`asset-icon ${asset.type}`}><FilmIcon/></div>
      <div className="asset-copy"><div><strong>{presentation.name}</strong>{presentation.highlighted ? <em>重点素材</em> : null}</div><span>{presentation.detail}</span><small>{assetTypeName[asset.type]} · {status === "ready" ? "已就绪" : status === "blocked" ? "已阻止" : "待补充"}</small></div>
      <span className={`integrity-dot ${status}`}/>
      {status === "missing" ? <button className="mini-button" onClick={() => inputRef.current?.click()}>补素材</button> : <button className="mini-button" onClick={() => onInsert(asset)}>加入</button>}
      <input hidden ref={inputRef} type="file" onChange={(event) => {const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = "";}}/>
    </div>
  );
};

const AssetGroup = ({title, note, highlighted, assets, statusFor, onUpload, onInsert}: {title: string; note: string; highlighted?: boolean; assets: Asset[]; statusFor: (asset: Asset) => "ready" | "missing" | "blocked"; onUpload: (asset: Asset, file: File) => void; onInsert: (asset: Asset) => void}) => {
  if (!assets.length) return null;
  return <section className={`asset-group ${highlighted ? "asset-group-highlighted" : ""}`}><div className="asset-group-title"><div><strong>{title}</strong><span>{note}</span></div><b>{assets.length}</b></div>{assets.map((asset) => <AssetRow key={asset.id} asset={asset} status={statusFor(asset)} onUpload={(file) => onUpload(asset, file)} onInsert={onInsert}/>)}</section>;
};

const CanvasHitTargets = ({project, frame, selectedId, onSelect}: {project: ProjectDocument; frame: number; selectedId: string | undefined; onSelect: (clip: Clip) => void}) => {
  const targets = project.clips.filter((clip) => clip.enabled && clip.id !== "motion-candidate-preview" && clip.id !== selectedId && clip.from <= frame && clip.from + clip.durationInFrames > frame && clip.type !== "audio" && !(clip.type === "video" && clip.transform.zIndex === 0 && clip.props.recording !== true)).sort((a, b) => b.transform.zIndex - a.transform.zIndex);
  return <div className="canvas-hit-layer">{targets.map((clip) => <button key={clip.id} data-hit-clip-id={clip.id} aria-label={`选择画面对象 ${clip.id}`} style={{left: `${clip.transform.x / project.settings.width * 100}%`, top: `${clip.transform.y / project.settings.height * 100}%`, width: `${clip.transform.width / project.settings.width * 100}%`, height: `${clip.transform.height / project.settings.height * 100}%`, transform: `scale(${clip.transform.scale}) rotate(${clip.transform.rotation}deg)`, zIndex: clip.transform.zIndex + 100}} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => {event.preventDefault(); event.stopPropagation(); onSelect(clip);}}/>)}</div>;
};

type TimelineDrag = {mode: "move" | "trim-start" | "trim-end"; clipId: string; startX: number; laneWidth: number; original: Clip; baseProject: ProjectDocument; magneticButt: boolean; workspaceDuration: number};
type TimelineCommitMeta = {mode: TimelineDrag["mode"]; original: Clip; ripple: boolean};

const packTimelineLanes = (clips: Clip[]) => {
  const laneEnds: number[] = [];
  const items = [...clips].sort((a, b) => a.from - b.from || b.durationInFrames - a.durationInFrames).map((clip) => {
    let laneIndex = laneEnds.findIndex((end) => end <= clip.from);
    if (laneIndex < 0) laneIndex = laneEnds.length;
    laneEnds[laneIndex] = clip.from + clip.durationInFrames;
    return {clip, laneIndex};
  });
  return {items, laneCount: Math.max(1, laneEnds.length)};
};

const Timeline = ({project, currentFrame, selectedId, onSelect, onSeek, onPreview, onCommit, onToggleTrack, onClearCaptions, onClearMotions}: {
  project: ProjectDocument; currentFrame: number; selectedId: string | undefined;
  onSelect: (clipId: string) => void; onSeek: (frame: number) => void;
  onPreview: (clip: Clip | undefined) => void; onCommit: (clip: Clip, action: string, meta: TimelineCommitMeta) => void;
  onToggleTrack: (track: Track) => void;
  onClearCaptions: () => void;
  onClearMotions: () => void;
}) => {
  const duration = project.settings.durationInFrames;
  const tailFrames = project.settings.fps * 30;
  const timelineDuration = duration + tailFrames;
  const ordered = [...project.tracks].sort((a, b) => b.order - a.order);
  const [drag, setDrag] = useState<TimelineDrag>();
  const dragRef = useRef<TimelineDrag | undefined>(undefined);
  const didDragRef = useRef(false);
  const [scrubFrame, setScrubFrame] = useState<number>();
  const [pixelsPerSecond, setPixelsPerSecond] = useState(12);
  const [originalButtLock, setOriginalButtLock] = useState(true);
  const timelineWidth = Math.max(860, Math.round((timelineDuration / project.settings.fps) * pixelsPerSecond));
  const displayFrame = scrubFrame ?? currentFrame;
  const tickCount = Math.max(8, Math.min(64, Math.floor(timelineWidth / 110)));
  const captionCount = project.clips.filter((clip) => clip.type === "caption").length;
  const motionCount = project.clips.filter((clip) => clip.type === "template").length;
  const frameAtPointer = (element: HTMLElement, clientX: number) => {
    const rect = element.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    return Math.round(ratio * (timelineDuration - 1));
  };
  const startScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setScrubFrame(frameAtPointer(event.currentTarget, event.clientX));
  };
  const updateScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setScrubFrame(frameAtPointer(event.currentTarget, event.clientX));
  };
  const finishScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const target = frameAtPointer(event.currentTarget, event.clientX);
    event.currentTarget.releasePointerCapture(event.pointerId);
    setScrubFrame(undefined);
    onSeek(target);
  };
  const compute = (state: TimelineDrag, clientX: number) => {
    const delta = Math.round(((clientX - state.startX) / state.laneWidth) * state.workspaceDuration);
    const workspaceProject = {...state.baseProject, settings: {...state.baseProject.settings, durationInFrames: state.workspaceDuration}};
    if (state.mode === "move") return moveClip(workspaceProject, state.clipId, state.original.from + delta, state.magneticButt ? {sameTrackOnly: true, preventOverlap: true, tolerance: 15} : undefined);
    if (state.mode === "trim-start") return trimClipStart(workspaceProject, state.clipId, state.original.from + delta);
    return trimClipEnd(workspaceProject, state.clipId, state.original.from + state.original.durationInFrames + delta);
  };
  const startDrag = (event: ReactPointerEvent<HTMLElement>, clip: Clip, mode: TimelineDrag["mode"], track: Track) => {
    event.stopPropagation();
    if (track.locked) return;
    const lane = event.currentTarget.closest(".track-lane");
    if (!(lane instanceof HTMLElement)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const magneticButt = originalButtLock && (track.id === "track-main-video" || track.name.includes("口播原片"));
    const nextDrag = {mode, clipId: clip.id, startX: event.clientX, laneWidth: lane.getBoundingClientRect().width, original: clip, baseProject: project, magneticButt, workspaceDuration: timelineDuration};
    dragRef.current = nextDrag; setDrag(nextDrag);
    didDragRef.current = false;
    onSelect(clip.id);
    onSeek(clip.from + Math.min(9, clip.durationInFrames - 1));
  };
  const updateDrag = (event: ReactPointerEvent<HTMLElement>) => {if (dragRef.current && Math.abs(event.clientX - dragRef.current.startX) >= 2) {didDragRef.current = true; onPreview(compute(dragRef.current, event.clientX));}};
  const finishDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const active = dragRef.current; if (!active) return;
    if (Math.abs(event.clientX - active.startX) >= 2) {
      didDragRef.current = true;
      const next = compute(active, event.clientX);
      if (next) onCommit(next, active.mode === "move" ? "移动时间线对象" : active.magneticButt ? "联动裁切口播原片" : "裁切时间线对象", {mode: active.mode, original: active.original, ripple: active.magneticButt && active.mode !== "move"});
    }
    dragRef.current = undefined; onPreview(undefined); setDrag(undefined);
  };
  return (
    <section className="timeline-panel">
      <div className="timeline-toolbar"><div><LayersIcon/>连续多轨时间线 <span>普通轨道 4帧吸附</span><span className="tail-space-label">尾部编辑余量 30 秒</span><button data-testid="original-butt-lock" className={`butt-lock ${originalButtLock ? "active" : ""}`} onClick={() => setOriginalButtLock((value) => !value)}>原片顶死：{originalButtLock ? "开" : "关"}</button><button data-testid="clear-all-motions" className="clear-motions" disabled={motionCount === 0} onClick={onClearMotions}>一键清除动效{motionCount > 0 ? `（${motionCount}）` : ""}</button><button data-testid="clear-all-captions" className="clear-captions" disabled={captionCount === 0} onClick={onClearCaptions}>一键清除字幕{captionCount > 0 ? `（${captionCount}）` : ""}</button></div><div className="timeline-controls"><strong>{frameTime(displayFrame, project.settings.fps)} / {frameTime(duration, project.settings.fps)}</strong><button aria-label="缩小时间线" disabled={pixelsPerSecond <= 4} onClick={() => setPixelsPerSecond((value) => Math.max(4, Math.round(value / 2)))}>−</button><button onClick={() => setPixelsPerSecond(4)}>适配</button><button aria-label="放大时间线" disabled={pixelsPerSecond >= 64} onClick={() => setPixelsPerSecond((value) => Math.min(64, value * 2))}>＋</button><b>{pixelsPerSecond}px/s</b></div></div>
      <div className="timeline-scroll">
        <div className="timeline-ruler-row" style={{gridTemplateColumns: `132px ${timelineWidth}px`, minWidth: 132 + timelineWidth}}><div className="track-label ruler-label">轨道</div><div className={`ruler ${scrubFrame !== undefined ? "scrubbing" : ""}`} onPointerDown={startScrub} onPointerMove={updateScrub} onPointerUp={finishScrub} onPointerCancel={() => setScrubFrame(undefined)}>
          <div className="timeline-tail-zone" style={{left: `${duration / timelineDuration * 100}%`}}><b>编辑余量</b></div>
          {Array.from({length: tickCount + 1}, (_, index) => <span key={index} style={{left: `${(index / tickCount) * 100}%`}}>{frameTime(Math.round((timelineDuration * index) / tickCount), project.settings.fps)}</span>)}
          <div className="playhead" style={{left: `${(displayFrame / Math.max(1, timelineDuration - 1)) * 100}%`}}><em>{frameTime(displayFrame, project.settings.fps)}</em><i/></div>
        </div></div>
        {ordered.map((track) => {
          const layout = packTimelineLanes(project.clips.filter((clip) => clip.trackId === track.id));
          const rowHeight = Math.max(50, 10 + layout.laneCount * 38);
          return (
          <div className="track-row" key={track.id} style={{gridTemplateColumns: `132px ${timelineWidth}px`, minWidth: 132 + timelineWidth, height: rowHeight}}>
            <button className="track-label track-toggle" onClick={() => onToggleTrack(track)} title={track.locked ? "点击解锁轨道" : "点击锁定轨道"}><span className={`track-kind ${track.type}`}/><div><strong>{track.name}</strong><small>{track.type}</small></div>{track.locked ? <LockIcon/> : <EyeIcon/>}</button>
            <div className={`track-lane ${track.locked ? "locked" : ""}`}>
              <div className="timeline-tail-zone" style={{left: `${duration / timelineDuration * 100}%`}}/>
              {layout.items.map(({clip, laneIndex}) => (
                <button key={clip.id} data-clip-id={clip.id} className={`clip-block clip-${clip.type} ${selectedId === clip.id ? "selected" : ""} ${drag?.clipId === clip.id ? "dragging" : ""}`}
                  style={{left: `${(clip.from / timelineDuration) * 100}%`, width: `${Math.max(18 / timelineWidth * 100, (clip.durationInFrames / timelineDuration) * 100)}%`, top: 5 + laneIndex * 38}}
                  onPointerDown={(event) => startDrag(event, clip, "move", track)} onPointerMove={updateDrag} onPointerUp={finishDrag} onPointerCancel={() => {dragRef.current = undefined; onPreview(undefined); setDrag(undefined);}}
                  onClick={() => {if (didDragRef.current) {didDragRef.current = false; return;} onSelect(clip.id); onSeek(clip.from + Math.min(9, clip.durationInFrames - 1));}} title={`${String(clip.props.text ?? clip.props.title ?? clip.id)} · ${frameTime(clip.from, project.settings.fps)}–${frameTime(clip.from + clip.durationInFrames, project.settings.fps)}`}>
                  <i className="trim-handle trim-left" onPointerDown={(event) => startDrag(event, clip, "trim-start", track)}/>
                  <span>{typeLabel[clip.type]}</span><strong>{String(clip.props.text ?? clip.props.title ?? clip.id)}</strong>
                  <i className="trim-handle trim-right" onPointerDown={(event) => startDrag(event, clip, "trim-end", track)}/>
                </button>
              ))}
              <div className="lane-playhead" style={{left: `${(displayFrame / Math.max(1, timelineDuration - 1)) * 100}%`}}/>
            </div>
          </div>
        );})}
      </div>
    </section>
  );
};

type CanvasGesture = {mode: "move" | CanvasResizeHandle; startX: number; startY: number; width: number; height: number; original: Clip};
type CanvasGuide = {axis: "x" | "y"; value: number; kind: "canvas" | "object"};

const canvasResizeHandles: Array<{id: CanvasResizeHandle; label: string}> = [
  {id: "nw", label: "左上角"}, {id: "n", label: "上边"}, {id: "ne", label: "右上角"}, {id: "e", label: "右边"},
  {id: "se", label: "右下角"}, {id: "s", label: "下边"}, {id: "sw", label: "左下角"}, {id: "w", label: "左边"},
];

const CanvasSelection = ({clip, peers, metadata, locked, onPreview, onCommit}: {clip: Clip | undefined; peers: Clip[]; metadata: ReturnType<typeof resolveCompositionMetadata>; locked: boolean; onPreview: (clip: Clip | undefined) => void; onCommit: (clip: Clip, action: string) => void}) => {
  const [gesture, setGesture] = useState<CanvasGesture>();
  const [guides, setGuides] = useState<CanvasGuide[]>([]);
  const gestureRef = useRef<CanvasGesture | undefined>(undefined);
  if (!clip) return null;
  const isBaseVideo = clip.type === "video" && clip.transform.zIndex === 0;
  const safe = isBaseVideo || isClipWithinSafeArea(clip, metadata.safeArea, metadata.width, metadata.height);
  const compute = (state: CanvasGesture, clientX: number, clientY: number): {clip: Clip; guides: CanvasGuide[]} => {
    const dx = ((clientX - state.startX) / state.width) * metadata.width;
    const dy = ((clientY - state.startY) / state.height) * metadata.height;
    if (state.mode === "move") {
      const position = clampCanvasPosition(state.original.transform.x + dx, state.original.transform.y + dy, state.original.transform, metadata.width, metadata.height);
      const width = state.original.transform.width * state.original.transform.scale;
      const height = state.original.transform.height * state.original.transform.scale;
      const sourceX = [position.x, position.x + width / 2, position.x + width];
      const sourceY = [position.y, position.y + height / 2, position.y + height];
      const xCandidates = [
        {value: metadata.width / 2, kind: "canvas" as const},
        ...peers.flatMap((peer) => {
          const peerWidth = peer.transform.width * peer.transform.scale;
          return [peer.transform.x, peer.transform.x + peerWidth / 2, peer.transform.x + peerWidth].map((value) => ({value, kind: "object" as const}));
        }),
      ];
      const yCandidates = [
        {value: metadata.height / 2, kind: "canvas" as const},
        ...peers.flatMap((peer) => {
          const peerHeight = peer.transform.height * peer.transform.scale;
          return [peer.transform.y, peer.transform.y + peerHeight / 2, peer.transform.y + peerHeight].map((value) => ({value, kind: "object" as const}));
        }),
      ];
      const threshold = 12;
      const closest = (sources: number[], candidates: Array<{value: number; kind: "canvas" | "object"}>) => {
        let result: {delta: number; value: number; kind: "canvas" | "object"} | undefined;
        sources.forEach((source) => candidates.forEach((candidate) => {
          const delta = candidate.value - source;
          if (Math.abs(delta) <= threshold && (!result || Math.abs(delta) < Math.abs(result.delta))) result = {...candidate, delta};
        }));
        return result;
      };
      const snapX = closest(sourceX, xCandidates);
      const snapY = closest(sourceY, yCandidates);
      const snapped = clampCanvasPosition(position.x + (snapX?.delta ?? 0), position.y + (snapY?.delta ?? 0), state.original.transform, metadata.width, metadata.height);
      return {
        clip: updateClipTransform(state.original, snapped),
        guides: [
          ...(snapX ? [{axis: "x" as const, value: snapX.value, kind: snapX.kind}] : []),
          ...(snapY ? [{axis: "y" as const, value: snapY.value, kind: snapY.kind}] : []),
        ],
      };
    }
    return {clip: resizeClipFromHandle(state.original, state.mode, dx, dy, metadata.width, metadata.height), guides: []};
  };
  const start = (event: ReactPointerEvent<HTMLDivElement>, mode: CanvasGesture["mode"]) => {
    event.stopPropagation(); if (locked) return;
    const canvasElement = event.currentTarget.closest(".canvas-wrap");
    if (!(canvasElement instanceof HTMLElement)) return;
    const canvas = canvasElement.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    const nextGesture = {mode, startX: event.clientX, startY: event.clientY, width: canvas.width, height: canvas.height, original: clip};
    gestureRef.current = nextGesture; setGesture(nextGesture);
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!gestureRef.current || Math.hypot(event.clientX - gestureRef.current.startX, event.clientY - gestureRef.current.startY) < 2) return;
    const next = compute(gestureRef.current, event.clientX, event.clientY);
    setGuides(next.guides);
    onPreview(next.clip);
  };
  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = gestureRef.current;
    if (!active) return;
    if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) >= 2) {
      const next = compute(active, event.clientX, event.clientY);
      onCommit(next.clip, active.mode === "move" ? "移动并校准画布对象" : "缩放画布对象");
    }
    gestureRef.current = undefined;
    onPreview(undefined);
    setGesture(undefined);
    setGuides([]);
  };
  const cancel = () => {gestureRef.current = undefined; onPreview(undefined); setGesture(undefined); setGuides([]);};
  return <>
    {guides.map((guide) => <div key={`${guide.axis}-${guide.value}`} className={`canvas-guide canvas-guide-${guide.axis} ${guide.kind}`} style={guide.axis === "x" ? {left: `${guide.value / metadata.width * 100}%`} : {top: `${guide.value / metadata.height * 100}%`}}><span>{guide.kind === "canvas" ? "画布居中" : "对象对齐"}</span></div>)}
    <div data-testid="canvas-selection" className={`canvas-selection ${safe ? "" : "unsafe"} ${locked ? "locked" : ""} ${gesture ? "dragging" : ""}`} style={{left: `${(clip.transform.x / metadata.width) * 100}%`, top: `${(clip.transform.y / metadata.height) * 100}%`, width: `${(clip.transform.width / metadata.width) * 100}%`, height: `${(clip.transform.height / metadata.height) * 100}%`, transform: `scale(${clip.transform.scale}) rotate(${clip.transform.rotation}deg)`}} onPointerDown={(event) => start(event, "move")} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel}><span>{isBaseVideo ? `${clip.id} · 全画布原片` : safe ? clip.id : `${clip.id} · 超出安全区`}</span>{canvasResizeHandles.map((handle) => <div key={handle.id} data-testid={`canvas-resize-${handle.id}`} aria-label={`${handle.label}缩放`} className={`canvas-resize canvas-resize-${handle.id}`} onPointerDown={(event) => start(event, handle.id)} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel}/>)}</div>
  </>;
};

const Workbench = ({bundle, onBack, onReload}: {bundle: ProjectBundle; onBack: () => void; onReload: () => Promise<void>}) => {
  const {styleProfile, templateRegistryVersion, templateRegistry, assetMap, integrity} = bundle;
  const persist = useCallback((project: ProjectDocument, action: string) => api.saveProject(project, action), []);
  const initialProject = useMemo(() => normalizeImportedMaterialLayout(bundle.project), [bundle.project]);
  const editor = useProjectEditor(initialProject, persist);
  const currentProjectRef = useRef(editor.project);
  currentProjectRef.current = editor.project;
  const [previewClip, setPreviewClip] = useState<Clip>();
  const [motionSeed, setMotionSeed] = useState<MotionDesignSeed>();
  const [motionCandidate, setMotionCandidate] = useState<Clip>();
  const [motionLibraryRevision, setMotionLibraryRevision] = useState(0);
  const editProject = useMemo(() => previewClip ? replaceClip(editor.project, previewClip) : editor.project, [editor.project, previewClip]);
  const visualProject = useMemo(() => {
    return motionCandidate ? {...editProject, clips: [...editProject.clips, motionCandidate]} : editProject;
  }, [editProject, motionCandidate]);
  const runtimeAssetMap = useMemo(() => ({...Object.fromEntries(editor.project.assets.map((asset) => [asset.id, asset.derived?.proxyPath ?? asset.sourcePath])), ...assetMap}), [assetMap, editor.project.assets]);
  const inputProps = useMemo<EditorInputProps>(() => ({project: visualProject, styleProfile, templateRegistry, assetMap: runtimeAssetMap}), [visualProject, styleProfile, templateRegistry, runtimeAssetMap]);
  const metadata = resolveCompositionMetadata(inputProps);
  const playerRef = useRef<PlayerRef>(null);
  const [frame, setFrame] = useState(0);
  const [selectedId, setSelectedId] = useState<string | undefined>(() => bundle.project.clips.find((clip) => clip.type === "template")?.id ?? bundle.project.clips[0]?.id);
  const [tab, setTab] = useState<"assets" | "motion">("assets");
  const [sidePanel, setSidePanel] = useState<"content" | "motion" | "recording">("content");
  const [uploading, setUploading] = useState<string>();
  const assetImportRef = useRef<HTMLInputElement>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [autosaves, setAutosaves] = useState<Awaited<ReturnType<typeof api.autosaves>>>([]);
  const selected = editProject.clips.find((clip) => clip.id === selectedId);
  const selectedTrack = selected ? editProject.tracks.find((track) => track.id === selected.trackId) : undefined;
  const selectedOnCanvas = selected && selected.enabled && selected.from <= frame && selected.from + selected.durationInFrames > frame && !(selected.type === "video" && selected.transform.zIndex === 0 && selected.props.recording !== true) ? selected : undefined;
  const knownIntegrityIds = new Set(integrity.map((item) => item.assetId));
  const ready = integrity.filter((item) => item.status === "ready").length + editor.project.assets.filter((asset) => !knownIntegrityIds.has(asset.id)).length;
  const preloadMaterials = useMemo(() => editor.project.assets
    .filter((asset) => (asset.type === "video" || asset.type === "image") && !/^asset-original-\d+$/.test(asset.id) && asset.id !== "asset-raw-video")
    .map((asset) => {
      const source = runtimeAssetMap[asset.id];
      const cleanSource = source?.toLowerCase().split(/[?#]/)[0] ?? "";
      const contentType = cleanSource.endsWith(".mp4") ? "video/mp4"
        : cleanSource.endsWith(".webm") ? "video/webm"
          : cleanSource.endsWith(".png") ? "image/png"
            : cleanSource.endsWith(".jpg") || cleanSource.endsWith(".jpeg") ? "image/jpeg"
              : asset.mimeType;
      return {id: asset.id, source, contentType};
    })
    .filter((item): item is {id: string; source: string; contentType: string | undefined} => Boolean(item.source)), [editor.project.assets, runtimeAssetMap]);
  const preloadSignature = preloadMaterials.map((item) => `${item.id}:${item.source}`).join("|");

  useEffect(() => {window.scrollTo(0, 0);}, []);
  useEffect(() => {const timer = window.setInterval(() => setFrame(playerRef.current?.getCurrentFrame() ?? 0), 80); return () => window.clearInterval(timer);}, []);
  useEffect(() => {
    const handles = preloadMaterials.map((item) => prefetch(staticFile(item.source), {
      method: "blob-url",
      ...(item.contentType ? {contentType: item.contentType} : {}),
      logLevel: "warn",
    }));
    for (const handle of handles) void handle.waitUntilDone().catch(() => undefined);
    return () => handles.forEach((handle) => handle.free());
  // The signature intentionally keeps prefetch handles alive while ordinary
  // timeline edits replace ProjectDocument objects without changing sources.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadSignature]);
  useEffect(() => {
    const handles = CARD_SFX_PRESETS.flatMap((preset) => "path" in preset ? [prefetch(staticFile(preset.path), {
      method: "blob-url",
      contentType: "audio/mpeg",
      logLevel: "warn",
    })] : []);
    for (const handle of handles) void handle.waitUntilDone().catch(() => undefined);
    return () => handles.forEach((handle) => handle.free());
  }, []);
  useEffect(() => {
    const deleteSelectedMotion = (event: KeyboardEvent) => {
      if ((event.key !== "Delete" && event.key !== "Backspace") || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      if (!selected || selected.type !== "template" || selectedTrack?.locked) return;
      event.preventDefault();
      editor.removeClip(selected.id);
      setSelectedId(undefined);
    };
    window.addEventListener("keydown", deleteSelectedMotion);
    return () => window.removeEventListener("keydown", deleteSelectedMotion);
  }, [editor.removeClip, selected, selectedTrack?.locked]);
  useEffect(() => {
    const toggleFocusedPlayback = (event: KeyboardEvent) => {
      const isSpace = event.code === "Space" || event.key === " " || event.key === "Spacebar";
      if (!isSpace || event.repeat) return;
      const target = document.activeElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      const player = playerRef.current;
      if (!player) return;
      const currentFrame = player.getCurrentFrame();
      const hasFocusedEffect = editor.project.clips.some((clip) => clip.enabled
        && clip.props.fullScreenFocus === true
        && clip.from <= currentFrame
        && clip.from + clip.durationInFrames > currentFrame);
      if (!hasFocusedEffect && !player.isFullscreen()) return;
      event.preventDefault();
      event.stopPropagation();
      player.toggle();
    };
    window.addEventListener("keydown", toggleFocusedPlayback, true);
    return () => window.removeEventListener("keydown", toggleFocusedPlayback, true);
  }, [editor.project.clips]);
  const seek = (target: number) => {const next = Math.max(0, Math.min(metadata.durationInFrames - 1, target)); playerRef.current?.seekTo(next); setFrame(next);};
  const commitClip = (clip: Clip, action: string, meta?: TimelineCommitMeta) => {
    setPreviewClip(undefined);
    const replaced = meta?.ripple && meta.mode !== "move"
      ? rippleTrimProject(editor.project, meta.original, clip, meta.mode === "trim-start" ? "start" : "end")
      : replaceClip(editor.project, clip);
    editor.commit(fitProjectDurationToContent(replaced), action);
    setSelectedId(clip.id);
  };
  const isMaterialClip = (clip: Clip) => clip.type === "image" || clip.type === "video" || Boolean(clip.componentId?.endsWith("proof-frame") || clip.componentId?.endsWith("demo-focus"));
  const isBaseAroll = (clip: Clip) => clip.type === "video" && clip.transform.zIndex === 0 && clip.props.recording !== true;
  const toggleFullScreenFocus = (clip: Clip) => {
    if (!isMaterialClip(clip) || isBaseAroll(clip)) return;
    const active = clip.props.fullScreenFocus === true;
    if (active) {
      const restoreTransform = clip.props.focusRestoreTransform;
      const restoreProps = clip.props.focusRestoreProps;
      const nextTransform = restoreTransform && typeof restoreTransform === "object" && !Array.isArray(restoreTransform)
        ? {...clip.transform, ...(restoreTransform as Partial<Clip["transform"]>)}
        : clip.transform;
      const restoredProps = restoreProps && typeof restoreProps === "object" && !Array.isArray(restoreProps)
        ? {...clip.props, ...(restoreProps as Record<string, unknown>)}
        : {...clip.props};
      delete restoredProps.focusRestoreTransform;
      delete restoredProps.focusRestoreProps;
      restoredProps.fullScreenFocus = false;
      editor.commit(replaceClip(editor.project, {...clip, transform: nextTransform, props: restoredProps}), "退出全屏案例展示");
      return;
    }
    const restoreProps = {
      enterPreset: clip.props.enterPreset,
      edgeFadeMode: clip.props.edgeFadeMode,
      tiltY: clip.props.tiltY,
      tiltX: clip.props.tiltX,
      fit: clip.props.fit,
    };
    const asset = clip.assetId ? editor.project.assets.find((item) => item.id === clip.assetId) : undefined;
    const sourceRatio = asset?.width && asset.height ? asset.width / asset.height : clip.transform.width / Math.max(1, clip.transform.height);
    const canvasRatio = editor.project.settings.width / editor.project.settings.height;
    const focusWidth = sourceRatio >= canvasRatio ? editor.project.settings.width : editor.project.settings.height * sourceRatio;
    const focusHeight = sourceRatio >= canvasRatio ? editor.project.settings.width / sourceRatio : editor.project.settings.height;
    const focused: Clip = {
      ...clip,
      transform: {x: (editor.project.settings.width - focusWidth) / 2, y: (editor.project.settings.height - focusHeight) / 2, width: focusWidth, height: focusHeight, scale: 1, rotation: 0, opacity: 1, zIndex: Math.max(80, clip.transform.zIndex)},
      props: {
        ...clip.props,
        fullScreenFocus: true,
        focusRestoreTransform: {...clip.transform},
        focusRestoreProps: restoreProps,
        pipShape: clip.props.pipShape === "circle" ? "circle" : "rounded-rect",
        focusTransitionFrames: Number(clip.props.focusTransitionFrames ?? 24),
        enterPreset: "focus-expand",
        edgeFadeMode: "none",
        tiltY: 0,
        tiltX: 0,
        fit: "fill",
      },
    };
    editor.commit(replaceClip(editor.project, focused), "开启全屏案例与口播画中画");
    setSelectedId(focused.id);
  };
  const applyGlobalVisual = (source: Clip) => {
    const commonKeys = ["accentColor", "borderColor", "tiltY", "tiltX", "enterPreset", "glassBlur", "surfaceStyle", "gradientDirection", "gradientStrength", "surfaceOpacity", "glassBorderWidth", "glassBorderGlow"] as const;
    const materialKeys = ["materialSurfaceMode", "edgeFadeMode", "edgeFadeWidth"] as const;
    const textKeys = ["titleColor", "detailColor", "bodyColor", "eyebrowColor", "pointFontColor"] as const;
    const copyKeys = (props: Record<string, unknown>, keys: readonly string[]) => {
      const next = {...props};
      keys.forEach((key) => {
        if (source.props[key] !== undefined) next[key] = source.props[key];
      });
      return next;
    };
    const clips = editor.project.clips.map((target) => {
      const targetIsMaterial = isMaterialClip(target) && !isBaseAroll(target);
      const eligible = target.type === "template" || targetIsMaterial;
      if (!eligible) return target;
      let props = copyKeys(target.props, commonKeys);
      if (targetIsMaterial) props = copyKeys(props, materialKeys);
      if (target.type === "template") props = copyKeys(props, textKeys);
      return {...target, props};
    });
    editor.commit({...editor.project, clips}, "应用当前视觉到全部素材与动效");
  };
  const applyGlobalPosition = (source: Clip, scope: "right-cards" | "left-materials") => {
    const canvasMiddle = editor.project.settings.width / 2;
    const clips = editor.project.clips.map((target) => {
      const centerX = target.transform.x + target.transform.width * target.transform.scale / 2;
      const targetIsMaterial = isMaterialClip(target) && !isBaseAroll(target);
      const matches = scope === "right-cards"
        ? target.type === "template" && !targetIsMaterial && centerX >= canvasMiddle
        : targetIsMaterial && centerX <= canvasMiddle;
      if (!matches) return target;
      const position = clampCanvasPosition(source.transform.x, source.transform.y, target.transform, editor.project.settings.width, editor.project.settings.height);
      return updateClipTransform(target, position);
    });
    editor.commit({...editor.project, clips}, scope === "right-cards" ? "统一全部右侧卡片位置" : "统一全部左侧素材位置");
  };
  const toggleTrack = (track: Track) => editor.commit({...editor.project, tracks: editor.project.tracks.map((item) => item.id === track.id ? {...item, locked: !item.locked} : item)}, track.locked ? "解锁轨道" : "锁定轨道");
  const attach = async (assetId: string, file: File) => {setUploading(assetId); try {await api.attachAsset(editor.project.projectId, assetId, file); await onReload();} catch (cause) {window.alert(cause instanceof Error ? cause.message : "素材导入失败");} finally {setUploading(undefined);}};
  const duplicate = (clipId: string) => {const nextId = editor.copyClip(clipId); setSelectedId(nextId);};
  const remove = (clipId: string) => {editor.removeClip(clipId); setSelectedId(undefined);};
  const clearCaptions = () => {
    const count = editor.project.clips.filter((clip) => clip.type === "caption").length;
    if (count === 0) return;
    setPreviewClip(undefined);
    setMotionCandidate(undefined);
    editor.commit(clearCaptionClips(editor.project), `一键清除 ${count} 条字幕`);
    if (selected?.type === "caption") setSelectedId(undefined);
  };
  const clearMotions = () => {
    const count = editor.project.clips.filter((clip) => clip.type === "template").length;
    if (count === 0) return;
    setPreviewClip(undefined);
    setMotionCandidate(undefined);
    setMotionSeed(undefined);
    editor.commit(clearMotionClips(editor.project), `一键清除 ${count} 个动效`);
    if (selected?.type === "template") setSelectedId(undefined);
    if (sidePanel === "motion") setSidePanel("content");
  };
  const motionClip = (draft: MotionDesignDraft, id: string): Clip => {
    const isCaption = draft.componentId.endsWith("caption");
    const trackId = isCaption ? "track-captions" : "track-overlays";
    const remaining = Math.max(1, editor.project.settings.durationInFrames - frame);
    return {id, type: isCaption ? "caption" : "template", trackId, from: frame, durationInFrames: Math.max(1, Math.min(draft.durationInFrames, remaining)), sourceInFrames: 0, ...(draft.assetId ? {assetId: draft.assetId} : {}), props: {title: draft.title, text: draft.title, detail: draft.detail, purpose: draft.detail, accentColor: draft.accentColor, enterPreset: draft.enterPreset, ...draft.extraProps, ...(draft.assetId ? {assetId: draft.assetId} : {})}, componentId: draft.componentId, templateVersion: draft.templateVersion, transform: {...draft.defaultTransform, zIndex: isCaption ? 50 : 40}, enabled: true, origin: {kind: "motion-spec", sourceId: draft.name}};
  };
  const motionDraftFromPreset = (preset: MotionPreset): MotionDesignDraft | undefined => {
    const template = templateRegistry.find((item) => item.componentId === preset.componentId);
    if (!template) return undefined;
    const props = {...template.defaultProps, ...preset.props};
    const extraProps = {...props};
    for (const key of ["title", "text", "detail", "purpose", "accentColor", "enterPreset", "assetId"]) delete extraProps[key];
    return {
      name: preset.name,
      componentId: preset.componentId,
      templateVersion: preset.templateVersion,
      title: typeof props.title === "string" ? props.title : typeof props.text === "string" ? props.text : "",
      detail: typeof props.detail === "string" ? props.detail : typeof props.purpose === "string" ? props.purpose : "",
      accentColor: typeof props.accentColor === "string" ? props.accentColor : "#38d9ff",
      enterPreset: typeof props.enterPreset === "string" ? props.enterPreset : styleProfile.motion.allowedPresets[0] ?? "tech-slide-scale",
      durationInFrames: Math.min(
        editor.project.settings.fps * (
          preset.componentId.endsWith("progressive-points")
            ? 15
            : preset.componentId.endsWith("ai-convergence")
              ? 6
              : 3
        ),
        editor.project.settings.durationInFrames,
      ),
      extraProps,
      ...(typeof props.assetId === "string" && props.assetId ? {assetId: props.assetId} : {}),
      defaultTransform: preset.defaultTransform,
    };
  };
  const insertMotion = (draft: MotionDesignDraft, placement?: {x: number; y: number}) => {
    const id = `motion-${Date.now().toString(36)}`;
    let clip = motionClip(draft, id);
    if (placement && clip.type !== "caption") {
      const position = clampCanvasPosition(
        placement.x - clip.transform.width * clip.transform.scale / 2,
        placement.y - clip.transform.height * clip.transform.scale / 2,
        clip.transform,
        metadata.width,
        metadata.height,
      );
      clip = updateClipTransform(clip, position);
    }
    const trackType: Track["type"] = clip.type === "caption" ? "caption" : "overlay";
    const track: Track = {id: clip.trackId, type: trackType, name: clip.type === "caption" ? "字幕" : "动效与信息卡", order: clip.type === "caption" ? 20 : 15, enabled: true, locked: false};
    const next = {...editor.project, templateRegistryVersion, tracks: editor.project.tracks.some((item) => item.id === clip.trackId) ? editor.project.tracks : [...editor.project.tracks, track], clips: [...editor.project.clips, clip]};
    editor.commit(next, placement ? "拖入动效素材" : "加入动效候选"); setMotionCandidate(undefined); setMotionSeed(undefined); setSelectedId(id); setSidePanel("content"); seek(frame);
  };
  const dropOnStage = async (event: ReactDragEvent<HTMLElement>) => {
    const stage = event.currentTarget;
    const dropPoint = {clientX: event.clientX, clientY: event.clientY};
    const assetId = event.dataTransfer.getData("application/x-ajiunotes-asset");
    const asset = editor.project.assets.find((item) => item.id === assetId);
    if (asset) {event.preventDefault(); insertAsset(asset); return;}
    const presetId = event.dataTransfer.getData("application/x-ajiunotes-motion-preset");
    if (!presetId) return;
    event.preventDefault();
    const serializedPreset = event.dataTransfer.getData("application/x-ajiunotes-motion-preset-json");
    let draggedPreset: MotionPreset | undefined;
    if (serializedPreset) {
      try {
        const parsed = JSON.parse(serializedPreset) as MotionPreset;
        if (parsed.id === presetId) draggedPreset = parsed;
      } catch {
        // Continue with the shared built-in/server catalog below.
      }
    }
    const builtInPreset = createCommunityMotionPresets(editor.project).find((item) => item.id === presetId);
    const preset = draggedPreset ?? builtInPreset ?? (await api.motionPresets()).find((item) => item.id === presetId);
    if (!preset) {window.alert("动效预设不存在，请刷新动效库后重试"); return;}
    const draft = motionDraftFromPreset(preset);
    if (!draft) {window.alert("动效模板缺失，暂时不能加入画面"); return;}
    const canvas = stage.querySelector<HTMLElement>(".canvas-wrap");
    const rect = canvas?.getBoundingClientRect();
    const placement = rect && dropPoint.clientX >= rect.left && dropPoint.clientX <= rect.right && dropPoint.clientY >= rect.top && dropPoint.clientY <= rect.bottom
      ? {x: (dropPoint.clientX - rect.left) / rect.width * metadata.width, y: (dropPoint.clientY - rect.top) / rect.height * metadata.height}
      : undefined;
    insertMotion(draft, placement);
  };
  const insertRecording = (request: RecordingInsert) => {
    const project = editor.project;
    const assetId = request.recording.id;
    const trackId = "track-recordings";
    const id = `case-${Date.now().toString(36)}`;
    const remaining = Math.max(1, project.settings.durationInFrames - frame);
    const durationInFrames = Math.max(1, Math.min(request.durationInFrames, remaining));
    const horizontal = project.settings.orientation === "horizontal";
    const asset: Asset = {id: assetId, type: "video", sourcePath: request.recording.sourcePath, sourceKind: "owned", licenseStatus: "owned_or_created", ingestStatus: "approved", mimeType: request.recording.mimeType, durationInFrames: request.recording.durationInFrames, width: request.recording.width, height: request.recording.height};
    const baseClip: Clip = {id, type: "video", trackId, from: frame, durationInFrames, sourceInFrames: request.sourceInFrames, assetId, props: {recording: true, importedMaterial: true, aspectInitialized: true, title: request.title, overlayText: request.overlayText, enterPreset: request.enterPreset, accentColor: "#38d9ff", borderColor: "#38d9ff", materialSurfaceMode: "edge-glass", edgeFadeMode: "both", edgeFadeWidth: 14, glassBorderWidth: 12, glassBorderGlow: 70, fit: "fill", tiltY: 0, tiltX: 0}, transform: horizontal ? {x: 160, y: 70, width: 960, height: 540, scale: 1, rotation: 0, opacity: 1, zIndex: 10} : {x: 80, y: 280, width: 920, height: 518, scale: 1, rotation: 0, opacity: 1, zIndex: 10}, enabled: true, origin: {kind: "import", sourceId: request.recording.fileName}};
    const clip = fitClipToAssetAspect(baseClip, asset.width, asset.height, project.settings.width, project.settings.height);
    const next: ProjectDocument = {...project, assets: project.assets.some((item) => item.id === assetId) ? project.assets : [...project.assets, asset], tracks: project.tracks.some((item) => item.id === trackId) ? project.tracks : [...project.tracks, {id: trackId, type: "video", name: "案例录屏", order: 6, enabled: true, locked: false, muted: false}], clips: [...project.clips, clip]};
    editor.commit(next, "加入录屏案例"); setSelectedId(id); setSidePanel("content"); seek(frame);
  };
  const insertAsset = (asset: Asset) => {
    if (asset.type === "subtitle" || asset.type === "font" || asset.type === "document") {window.alert("这种文件会保留在素材库，暂不能直接生成画布对象"); return;}
    const project = editor.project;
    const trackId = asset.type === "audio" ? "track-imported-audio" : asset.type === "image" ? "track-imported-overlays" : "track-imported-video";
    const trackType: Track["type"] = asset.type === "audio" ? "audio" : asset.type === "image" ? "overlay" : "video";
    const clipType: Clip["type"] = asset.type === "audio" ? "audio" : asset.type === "image" ? "image" : "video";
    const remaining = Math.max(1, project.settings.durationInFrames - frame);
    const durationInFrames = Math.max(1, Math.min(asset.durationInFrames ?? project.settings.fps * 3, remaining));
    const horizontal = project.settings.orientation === "horizontal";
    const baseClip: Clip = {id: `material-${Date.now().toString(36)}`, type: clipType, trackId, from: frame, durationInFrames, sourceInFrames: 0, assetId: asset.id, props: {fit: "fill", importedMaterial: true, aspectInitialized: true, materialSurfaceMode: "edge-glass", edgeFadeMode: "both", edgeFadeWidth: 14, glassBorderWidth: 12, glassBorderGlow: 70, borderColor: "#38d9ff", tiltY: 0, tiltX: 0}, transform: clipType === "audio" ? {x: 0, y: 0, width: 1, height: 1, scale: 1, rotation: 0, opacity: 1, zIndex: 0} : horizontal ? {x: 160, y: 70, width: 960, height: 540, scale: 1, rotation: 0, opacity: 1, zIndex: asset.type === "image" ? 30 : 8} : {x: 80, y: 280, width: 920, height: 518, scale: 1, rotation: 0, opacity: 1, zIndex: asset.type === "image" ? 30 : 8}, enabled: true, origin: {kind: "import", sourceId: asset.id}};
    const clip = clipType === "audio" ? baseClip : fitClipToAssetAspect(baseClip, asset.width, asset.height, project.settings.width, project.settings.height);
    const track: Track = {id: trackId, type: trackType, name: asset.type === "audio" ? "导入音频" : asset.type === "image" ? "图片与证明素材" : "导入视频素材", order: asset.type === "audio" ? 3 : asset.type === "image" ? 12 : 5, enabled: true, locked: false, ...(asset.type === "audio" || asset.type === "video" ? {muted: false} : {})};
    const next: ProjectDocument = {...project, tracks: project.tracks.some((item) => item.id === trackId) ? project.tracks : [...project.tracks, track], clips: [...project.clips, clip]};
    editor.commit(next, "加入拍摄素材"); setSelectedId(clip.id); setSidePanel("content"); seek(frame);
  };
  const importAssets = async (files: File[]) => {
    if (!files.length) return;
    setUploading(`${files.length} 个素材`);
    try {
      const assets = await api.importAssets(editor.project.projectId, files);
      const known = new Set(editor.project.assets.map((asset) => asset.id));
      editor.commit({...editor.project, assets: [...editor.project.assets, ...assets.filter((asset) => !known.has(asset.id))]}, `导入 ${assets.length} 个拍摄素材`);
    } catch (cause) {window.alert(cause instanceof Error ? cause.message : "素材导入失败");}
    finally {setUploading(undefined);}
  };
  const importCaseAsset = async (clipId: string, caseIndex: number, file: File) => {
    setUploading(caseIndex < 0 ? "动效素材" : `案例 ${caseIndex + 1} 素材`);
    try {
      const imported = await api.importAssets(currentProjectRef.current.projectId, [file]);
      const asset = imported[0];
      if (!asset) throw new Error("没有读取到可用的图片或视频");
      if (asset.type !== "image" && asset.type !== "video") throw new Error("案例槽位只支持图片或视频");
      const project = currentProjectRef.current;
      const target = project.clips.find((item) => item.id === clipId);
      if (!target || target.type !== "template") throw new Error("当前案例动效已不存在，请重新选中后再导入");
      const known = new Set(project.assets.map((item) => item.id));
      if (caseIndex < 0) {
        const nextClip: Clip = {...target, assetId: asset.id};
        const next: ProjectDocument = {
          ...project,
          assets: known.has(asset.id) ? project.assets : [...project.assets, asset],
          clips: project.clips.map((item) => item.id === clipId ? nextClip : item),
        };
        editor.commit(next, "导入并替换动效图片或视频");
        setSelectedId(clipId);
        setSidePanel("content");
        return;
      }
      const cases = Array.isArray(target.props.cases)
        ? target.props.cases.map((item) => item && typeof item === "object" && !Array.isArray(item) ? {...item as Record<string, unknown>} : {})
        : [];
      while (cases.length <= caseIndex) cases.push({title: `案例 ${cases.length + 1}`, detail: "", appearFrame: 10 + cases.length * project.settings.fps});
      cases[caseIndex] = {...cases[caseIndex], assetId: asset.id};
      const nextClip: Clip = {...target, props: {...target.props, cases}};
      const next: ProjectDocument = {
        ...project,
        assets: known.has(asset.id) ? project.assets : [...project.assets, asset],
        clips: project.clips.map((item) => item.id === clipId ? nextClip : item),
      };
      editor.commit(next, `导入并替换案例 ${caseIndex + 1} 素材`);
      setSelectedId(clipId);
      setSidePanel("content");
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : "案例素材导入失败");
    } finally {
      setUploading(undefined);
    }
  };
  const openRecovery = async () => {
    setRecoveryOpen(true); setRecoveryLoading(true);
    try {setAutosaves(await api.autosaves(editor.project.projectId));}
    catch (cause) {window.alert(cause instanceof Error ? cause.message : "恢复点读取失败");}
    finally {setRecoveryLoading(false);}
  };
  const restore = async (revision: number) => {
    if (!window.confirm(`恢复到 v${String(revision).padStart(4, "0")}？当前项目会先保留为新的恢复点。`)) return;
    setRecoveryLoading(true);
    try {await api.restoreAutosave(editor.project.projectId, revision); setRecoveryOpen(false); await onReload();}
    catch (cause) {window.alert(cause instanceof Error ? cause.message : "恢复失败"); setRecoveryLoading(false);}
  };
  const supportAssets = editor.project.assets.filter((asset) => assetPresentation(asset).group === "support");
  const originalAssets = editor.project.assets.filter((asset) => assetPresentation(asset).group === "original").sort((a, b) => a.id.localeCompare(b.id, "zh-CN", {numeric: true}));
  const projectAssets = editor.project.assets.filter((asset) => assetPresentation(asset).group === "project");
  const assetStatus = (asset: Asset) => integrity.find((item) => item.assetId === asset.id)?.status ?? "ready";
  const saveLabel = editor.saveStatus === "saved" ? `已保存${editor.savedRevision ? ` · v${String(editor.savedRevision).padStart(4, "0")}` : ""}` : editor.saveStatus === "saving" ? "正在保存" : editor.saveStatus === "error" ? "服务断开 · 草稿已保存在本机" : editor.localDraftRestored ? "已恢复本机草稿 · 待保存" : "有未保存修改";
  return (
    <main className="workbench-shell">
      <header className="workbench-header">
        <div className="header-left"><button className="icon-button" onClick={() => {void editor.saveNow().then(onBack);}}><ArrowLeftIcon/></button><div className="brand compact"><div className="brand-mark">A9</div><div><strong>{editor.project.name}</strong><span>{editor.project.settings.width}×{editor.project.settings.height} · {editor.project.settings.fps} FPS</span></div></div></div>
        <div className="header-status"><span className="editable-badge"><SparkIcon/>本地可视化编辑</span><span className={`save-state ${editor.saveStatus}`} title={editor.saveError}>{saveLabel}</span><span>{ready}/{editor.project.assets.length} 素材就绪</span><span>{statusLabel(editor.project.status)}</span></div>
        <div className="header-actions"><button data-testid="undo" disabled={!editor.canUndo} onClick={editor.undo}>撤销</button><button data-testid="redo" disabled={!editor.canRedo} onClick={editor.redo}>重做</button><button data-testid="recovery" onClick={() => {void openRecovery();}}>恢复点</button><button data-testid="save" className="check-button" onClick={() => {void editor.saveNow();}}><CheckIcon/>保存</button></div>
      </header>
      <div className="workbench-main">
        <aside className="library-panel"><div className="library-tabs"><button className={tab === "assets" ? "active" : ""} onClick={() => setTab("assets")}><FolderIcon/>素材</button><button className={tab === "motion" ? "active" : ""} onClick={() => setTab("motion")}><GridIcon/>动效</button></div><div className="search-box"><SearchIcon/><span>{tab === "assets" ? "拍摄、案例与证明素材" : "动效库与剪辑经验"}</span></div>
          {tab === "assets" ? <><div className="asset-import-head"><div><strong>本片素材</strong><span>可多选导入，再拖到画布或时间线</span></div><button onClick={() => assetImportRef.current?.click()}>导入</button><input ref={assetImportRef} hidden multiple type="file" accept="video/*,image/*,audio/*,.srt,.vtt,.ass" onChange={(event) => {void importAssets(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = "";}}/></div><div className="asset-list"><AssetGroup highlighted title="动画、案例与证明素材" note="高光标注；后续为本条视频制作的动态素材统一放这里" assets={supportAssets} statusFor={assetStatus} onUpload={(asset, file) => attach(asset.id, file)} onInsert={insertAsset}/><AssetGroup title="口播原片" note="全部独立保留，可逐段裁切气口" assets={originalAssets} statusFor={assetStatus} onUpload={(asset, file) => attach(asset.id, file)} onInsert={insertAsset}/><AssetGroup title="项目辅助文件" note="合并备份与字幕文件，不替代口播原片" assets={projectAssets} statusFor={assetStatus} onUpload={(asset, file) => attach(asset.id, file)} onInsert={insertAsset}/>{uploading ? <div className="uploading">正在导入 {uploading}…</div> : null}</div></> : <MotionLibraryPanel project={editor.project} templates={templateRegistry} refreshKey={motionLibraryRevision} onDesign={(seed) => {setMotionSeed(seed); setMotionCandidate(undefined); setSidePanel("motion");}}/>} 
        </aside>
        <section className="editor-stage" onDragOver={(event: ReactDragEvent<HTMLElement>) => {if (event.dataTransfer.types.includes("application/x-ajiunotes-asset") || event.dataTransfer.types.includes("application/x-ajiunotes-motion-preset")) {event.preventDefault(); event.dataTransfer.dropEffect = "copy";}}} onDrop={(event: ReactDragEvent<HTMLElement>) => {void dropOnStage(event);}}><div className="stage-toolbar"><div><span className="live-dot"/>同源 Remotion Player</div><div>当前帧 <strong>{frame}</strong> / {metadata.durationInFrames - 1}</div></div><div className="canvas-area"><div className="canvas-wrap" style={{aspectRatio: `${metadata.width}/${metadata.height}`, width: `min(82cqw, 960px, calc(100cqh * ${metadata.width / metadata.height}))`}}>
          <Player ref={playerRef} component={EditorComposition} inputProps={inputProps} durationInFrames={metadata.durationInFrames} compositionWidth={metadata.width} compositionHeight={metadata.height} fps={metadata.fps} controls initiallyShowControls style={{width: "100%", height: "100%"}} acknowledgeRemotionLicense/>
          <CanvasHitTargets project={visualProject} frame={frame} selectedId={selectedId} onSelect={(clip) => {if (clip.id === "motion-candidate-preview") return; setSelectedId(clip.id); setSidePanel("content");}}/>
          <CanvasSelection clip={selectedOnCanvas} peers={visualProject.clips.filter((clip) => clip.id !== selectedOnCanvas?.id && clip.enabled && clip.from <= frame && clip.from + clip.durationInFrames > frame && clip.type !== "audio" && !(clip.type === "video" && clip.transform.zIndex === 0))} metadata={metadata} locked={Boolean(selectedTrack?.locked)} onPreview={setPreviewClip} onCommit={commitClip}/>
        </div></div><ShotNodes project={editProject} currentFrame={frame} onSelect={(node) => seek(node.from)}/><Timeline project={editProject} currentFrame={frame} selectedId={selectedId} onSelect={(id) => {setSelectedId(id); setSidePanel("content");}} onSeek={seek} onPreview={setPreviewClip} onCommit={commitClip} onToggleTrack={toggleTrack} onClearCaptions={clearCaptions} onClearMotions={clearMotions}/></section>
        <aside className="right-panel-stack"><nav className={motionSeed ? "right-panel-tabs three-tabs" : "right-panel-tabs two-tabs"}><button className={sidePanel === "content" ? "active" : ""} onClick={() => setSidePanel("content")}>内容</button>{motionSeed ? <button data-testid="motion-designer-tab" className={sidePanel === "motion" ? "active" : ""} onClick={() => setSidePanel("motion")}>动效设计</button> : null}<button data-testid="recording-tab" className={sidePanel === "recording" ? "active" : ""} onClick={() => setSidePanel("recording")}>案例录屏</button></nav>{sidePanel === "content" ? <ContentPanel clip={selected} track={selectedTrack} project={editor.project} allowedPresets={styleProfile.motion.allowedPresets} safe={metadata.safeArea} onUpdate={commitClip} onDuplicate={duplicate} onDelete={remove} onToggleFullScreen={toggleFullScreenFocus} onApplyGlobalVisual={applyGlobalVisual} onApplyGlobalPosition={applyGlobalPosition} onImportCaseAsset={importCaseAsset}/> : sidePanel === "motion" && motionSeed ? <MotionDesignerPanel key={`${motionSeed.template.componentId}-${motionSeed.preset?.id ?? "new"}`} project={editor.project} seed={motionSeed} allowedPresets={styleProfile.motion.allowedPresets} onPreview={(draft) => setMotionCandidate(motionClip(draft, "motion-candidate-preview"))} onInsert={insertMotion} onClose={() => {setMotionCandidate(undefined); setMotionSeed(undefined); setSidePanel("content");}} onSaved={() => setMotionLibraryRevision((value) => value + 1)}/> : <RecordingPanel project={editor.project} currentFrame={frame} allowedPresets={styleProfile.motion.allowedPresets} onInsert={insertRecording}/>}</aside>
      </div>
      <footer className="diagnostics-bar"><div><span className="diag-title">诊断</span><span className={ready === editor.project.assets.length ? "diag-ok" : "diag-warn"}>{ready === editor.project.assets.length ? <CheckIcon/> : <AlertIcon/>}{ready === editor.project.assets.length ? "素材完整" : `${editor.project.assets.length - ready} 项需处理`}</span><span><CheckIcon/>拖动预览与正式项目分离</span><span><CheckIcon/>每次松手仅写入一个历史节点</span></div><span>{editor.lastAction} · ProjectDocument / History / UI 已分层</span></footer>
      {recoveryOpen ? <div className="recovery-overlay" role="dialog" aria-label="项目恢复点"><section className="recovery-dialog"><header><div><span>LOCAL RECOVERY</span><h2>项目恢复点</h2></div><button onClick={() => setRecoveryOpen(false)}>关闭</button></header>{recoveryLoading ? <Empty message="正在读取恢复点…"/> : <div className="recovery-list">{autosaves.map((item) => <div className="recovery-item" key={item.revision}><div><strong>v{String(item.revision).padStart(4, "0")}</strong><span>{new Date(item.updatedAt).toLocaleString("zh-CN")}</span><small>{item.lastAction ?? "自动保存"}</small></div><button disabled={recoveryLoading} onClick={() => {void restore(item.revision);}}>恢复此版本</button></div>)}{autosaves.length === 0 ? <Empty message="当前还没有恢复点"/> : null}</div>}</section></div> : null}
    </main>
  );
};

export const App = () => {
  const frameTest = new URLSearchParams(window.location.search).get("frameTest");
  if (frameTest !== null) return <FrameTest frame={Number.parseInt(frameTest, 10) || 0}/>;
  return <ProjectApp/>;
};

const FrameTest = ({frame}: {frame: number}) => {
  const projectId = new URLSearchParams(window.location.search).get("project") ?? "example-project";
  const [bundle, setBundle] = useState<ProjectBundle>();
  const [error, setError] = useState<string>();
  useEffect(() => { void api.project(projectId).then(setBundle).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "加载失败")); }, [projectId]);
  if (error) return <div style={{color: "white", padding: 20}}>{error}</div>;
  if (!bundle) return <div style={{width: "100vw", height: "100vh", background: "#070a0f"}}/>;
  const inputProps: EditorInputProps = {project: bundle.project, styleProfile: bundle.styleProfile, templateRegistry: bundle.templateRegistry, assetMap: bundle.assetMap};
  const metadata = resolveCompositionMetadata(inputProps);
  return (
    <div data-testid="frame-test-ready" style={{width: "100vw", height: "100vh", overflow: "hidden", background: "#070a0f"}}>
      <Player
        component={EditorComposition}
        inputProps={inputProps}
        initialFrame={Math.max(0, Math.min(metadata.durationInFrames - 1, frame))}
        durationInFrames={metadata.durationInFrames}
        compositionWidth={metadata.width}
        compositionHeight={metadata.height}
        fps={metadata.fps}
        controls={false}
        style={{width: "100vw", height: "100vh"}}
        acknowledgeRemotionLicense
      />
    </div>
  );
};

const ProjectApp = () => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [health, setHealth] = useState<Health>();
  const [bundle, setBundle] = useState<ProjectBundle>();
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = async () => {
    setLoading(true); setError(undefined);
    try { const [items, state] = await Promise.all([api.listProjects(), api.health()]); setProjects(items); setHealth(state); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "无法连接本地服务"); }
    finally { setLoading(false); }
  };
  const open = async (id: string) => {
    setError(undefined);
    try { const next = await api.project(id); setSelectedId(id); setBundle(next); localStorage.setItem("ajiunotes.lastProject", id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "项目读取失败"); }
  };
  const rename = async (project: ProjectSummary, name: string) => {
    await api.renameProject(project.projectId, name);
    await refresh();
  };
  const remove = async (project: ProjectSummary) => {
    if (!window.confirm(`确定删除“${project.name}”吗？\n项目文件、素材和恢复点都会一并删除，此操作无法撤销。`)) return;
    try {
      await api.deleteProject(project.projectId);
      if (localStorage.getItem("ajiunotes.lastProject") === project.projectId) localStorage.removeItem("ajiunotes.lastProject");
      await refresh();
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : "项目删除失败");
    }
  };
  useEffect(() => { void refresh().then(() => {const last = localStorage.getItem("ajiunotes.lastProject"); if (last) void open(last);}); }, []);
  if (bundle && selectedId) return <Workbench key={`${bundle.project.projectId}-${bundle.project.updatedAt}`} bundle={bundle} onBack={() => {setBundle(undefined); setSelectedId(undefined); localStorage.removeItem("ajiunotes.lastProject");}} onReload={async () => {await open(selectedId);}}/>;
  return <ProjectCenter projects={projects} health={health} loading={loading} error={error} onOpen={open} onRefresh={refresh} onRename={rename} onDelete={remove}/>;
};
