export { createRoot } from "./root";
export type { Root, RootOptions } from "./root";
export { WebView } from "./webview";
export type {
  DownloadProgress,
  OpenWindowDecision,
  WebViewHandle,
  WebViewProps,
  WebViewState,
} from "./webview";
export { DevTools } from "./devtools";
export type { DevToolsProps } from "./devtools";
export type { DevtoolsDock } from "./web/types";
export type { ZoomDirection } from "./web/zoom";
export type { TerminalTheme } from "./web/session";
export { QUIT_URL } from "./web/host";

export {
  Box,
  Text,
  Input,
  Image,
  MarkedText,
  Path,
  Markdown,
  appLog,
  useTerminalColors,
  setClipboard,
  setPointerShape,
  requestClipboardImage,
  highlight,
  diff,
  parseMarkdown,
  HIGHLIGHT_CAPTURES,
  Surface,
  SurfaceCapture,
  captureFilmstrip,
  encodeRecording,
} from "./react";
export type {
  BoxProps,
  TextProps,
  TextSpan,
  InputProps,
  InputGutter,
  ImageProps,
  ImageAdvancedProps,
  MarkedTextProps,
  MarkRef,
  PathProps,
  ShapeStroke,
  ClickEvent,
  DragEvent,
  EventMods,
  MouseMoveEvent,
  ScrollEvent,
  WheelEvent,
  PointerEvent,
  PastedImage,
  PasteSource,
  CaretInfo,
  ChangeInfo,
  ChangeSource,
  ContainerSelection,
  SelectionPart,
  NodeHandle,
  Color,
  Edges,
  InsetEdges,
  InsetValue,
  ScrollbarStyle,
  Style,
  EngineInfo,
  EngineKeyEvent,
  KeyMods,
  Rgba,
  TerminalColors,
  SurfaceFrame,
  SurfaceTexture,
  CaptureStats,
  CaptureFrameMeta,
  CaptureIndex,
  MarkdownProps,
  MarkdownTheme,
  MarkdownBlock,
  HighlightSpan,
  DiffRow,
} from "./react";
export { makeTheme } from "./theme";
export type { Theme } from "./theme";
