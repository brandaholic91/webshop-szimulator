import React from 'react';

// A lap kontenere: 1200px, oldalmargoval. Minden tartalmi blokk ebbe kerul.
// A .g12 oszlopracs lathatatlan (40. dontes): a tartalom igazodik hozza,
// vonalat nem rajzolunk.
const Page: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <div className={`page ${className}`}>{children}</div>;

export default Page;
