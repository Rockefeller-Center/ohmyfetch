declare module NodeJS {
    interface ProcessEnv {
        readonly FETCH_KEEP_ALIVE?: string;
    }
}
