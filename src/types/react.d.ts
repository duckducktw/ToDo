import "react";

declare module "react" {
  interface ButtonHTMLAttributes<T> {
    // Firefox uses this attribute to control persisted dynamic disabled state.
    autoComplete?: T extends HTMLButtonElement ? "on" | "off" : never;
  }
}
