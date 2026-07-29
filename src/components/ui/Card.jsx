import React from 'react';

const Card = ({ children, className = '', accent, style = {}, ...props }) => {
  const accentStyle = accent ? { borderBottom: `3px solid ${accent}` } : {};
  return (
    <div className={`neu-card p-5 ${className}`} style={{ ...accentStyle, ...style }} {...props}>
      {children}
    </div>
  );
};

export default Card;
