import type {SVGProps} from "react";

const Icon = ({children, ...props}: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>
);

export const FolderIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><path d="M3 6.8A1.8 1.8 0 0 1 4.8 5h4l2 2h8.4A1.8 1.8 0 0 1 21 8.8v8.4a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 17.2Z" /></Icon>;
export const GridIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></Icon>;
export const LayersIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/></Icon>;
export const SlidersIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="13" cy="18" r="2"/></Icon>;
export const CheckIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><path d="m5 12 4 4L19 6"/></Icon>;
export const AlertIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4M12 16.5h.01"/></Icon>;
export const FilmIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4"/></Icon>;
export const ArrowLeftIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><path d="m15 18-6-6 6-6"/></Icon>;
export const UploadIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v4h16v-4"/></Icon>;
export const EyeIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></Icon>;
export const LockIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></Icon>;
export const SearchIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></Icon>;
export const SparkIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><path d="m12 3 1.2 4.3L17 9l-3.8 1.7L12 15l-1.2-4.3L7 9l3.8-1.7L12 3Z"/><path d="m19 14 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14Z"/></Icon>;
