/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user?: {
      email?: string;
    };
  }
}

declare module 'ssh2' {
  const value: any;
  export default value;
}
