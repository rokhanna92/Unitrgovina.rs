interface ImportMetaEnv {
  /** POST endpoint for quote requests (JSON body). Unset = requests are not sent. */
  readonly PUBLIC_QUOTE_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
