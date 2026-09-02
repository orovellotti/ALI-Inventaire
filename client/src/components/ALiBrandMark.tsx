import type { SVGProps } from "react";

/**
 * Compact terrain signature: a young leaf rooted in contour lines, with a
 * surveyed observation point at its centre. The SVG is intentionally
 * decorative; the enclosing brand control provides the accessible name.
 */
export function ALiBrandMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <path
        d="M6.4 27.7c2.6-2.25 5.13-3.15 7.61-2.69 1.95.36 3.92-.24 5.15-1.8 1.59-2 4.24-2.7 6.49-1.56 1.83.92 4.16.56 5.92-1.1"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity=".45"
      />
      <path
        d="M7.3 31.7c3.43-2.49 6.74-3.25 9.94-2.25 2.14.67 4.42.28 5.99-1.26 1.57-1.55 4.14-1.92 6.19-.78 1.24.69 2.4.83 3.48.44"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity=".72"
      />
      <path
        d="M19.93 30.75c-.13-5.06.48-10.51 4.35-15.65 2.05-2.72 4.88-4.87 8.37-6.25.3 4.65-1.18 8.75-4.12 11.48-2.34 2.18-5.3 3.25-8.6 3.38"
        fill="currentColor"
      />
      <path
        d="M19.93 30.75c.26-5.88-1.43-10.47-5.54-13.06-2.1-1.32-4.6-1.88-7.2-1.72.82 4.15 2.76 7.23 5.67 8.93 2.11 1.24 4.53 1.64 7.07 1.32"
        fill="currentColor"
        opacity=".86"
      />
      <path
        d="M19.93 31.05V22.9M19.93 25.6l5.3-6.15M19.93 25.8l-5.05-4.82"
        stroke="#1e594a"
        strokeWidth="1.12"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".78"
      />
      <circle cx="19.93" cy="31.2" r="3.15" fill="#1e594a" />
      <circle cx="19.93" cy="31.2" r="1.38" fill="currentColor" />
    </svg>
  );
}