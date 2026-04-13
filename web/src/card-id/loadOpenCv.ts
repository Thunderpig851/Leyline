declare global {
  interface Window {
    cv?: any;
    Module?: {
      onRuntimeInitialized?: () => void;
    };
  }
}

let openCvPromise: Promise<any> | null = null;

export function loadOpenCv(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OpenCV can only be loaded in the browser."));
  }

  if (window.cv?.Mat) {
    return Promise.resolve(window.cv);
  }

  if (openCvPromise) {
    return openCvPromise;
  }

  openCvPromise = new Promise((resolve, reject) => {
    const finalize = () => {
      if (window.cv?.Mat) {
        resolve(window.cv);
        return;
      }

      reject(new Error("OpenCV initialized but cv is unavailable."));
    };

    const waitForCv = () => {
      let attempts = 0;

      const poll = () => {
        if (window.cv?.Mat) {
          resolve(window.cv);
          return;
        }

        attempts += 1;
        if (attempts >= 200) {
          openCvPromise = null;
          reject(new Error("Timed out waiting for OpenCV to initialize."));
          return;
        }

        window.setTimeout(poll, 50);
      };

      poll();
    };

    window.Module = {
      ...(window.Module ?? {}),
      onRuntimeInitialized: finalize,
    };

    const existing = document.querySelector('script[data-opencv="true"]') as HTMLScriptElement | null;

    if (existing) {
      waitForCv();
      return;
    }

    const script = document.createElement("script");
    script.src = "/vendor/opencv.js";
    script.async = true;
    script.defer = true;
    script.dataset.opencv = "true";
    script.onerror = () => {
      openCvPromise = null;
      reject(new Error("Failed to load /vendor/opencv.js"));
    };
    script.onload = () => {
      if (window.cv?.Mat) {
        resolve(window.cv);
        return;
      }

      waitForCv();
    };
    document.body.appendChild(script);
  });

  return openCvPromise;
}
