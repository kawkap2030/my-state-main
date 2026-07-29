import React from "react";
import { Loader2 } from "lucide-react";

const variants = {
  primary: "neu-btn-primary",
  cta: "neu-btn-cta",
  danger: "neu-btn-danger",
  purple: "neu-btn-purple",
  ghost: "neu-btn-ghost",
};

const Button = ({
  children,
  variant = "primary",
  loading = false,
  disabled = false,
  icon: Icon,
  onClick,
  className = "",
  type = "button",
  ...props
}) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${variants[variant] || variants.primary} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 size={20} className="animate-spin" />
      ) : (
        Icon && <Icon size={20} />
      )}
      <span>{children}</span>
    </button>
  );
};

export default Button;
