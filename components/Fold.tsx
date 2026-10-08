import React from 'react';

// Lecsukott proza. A DESIGN.md szabalya: "szoveg soha ne alljon egyedul" -
// a proza nem tunik el, csak lecsukva var.
const Fold: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <details className="fold">
    <summary>
      <span className="w-3 font-bold text-primary">+</span>
      <span className="t-h-sm">{title}</span>
    </summary>
    <div className="t-body prose-col pb-5 text-on-surface-muted">{children}</div>
  </details>
);

export default Fold;
