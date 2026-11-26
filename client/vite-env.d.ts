/// <reference types="vite/client" />

/** The address of the backend given in the build (API_URL), empty if there is none. */
declare const __API_URL__: string;

/** The start of the hash of the commit the build was made of (COMMIT_SHA in the build), empty if not given. */
declare const __COMMIT__: string;
