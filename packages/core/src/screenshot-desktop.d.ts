declare module 'screenshot-desktop' {
  interface ScreenshotOptions {
    format?: 'png' | 'jpg';
    screen?: string | number;
    filename?: string;
  }
  
  function screenshot(options?: ScreenshotOptions): Promise<Buffer | string>;
  
  export = screenshot;
}
