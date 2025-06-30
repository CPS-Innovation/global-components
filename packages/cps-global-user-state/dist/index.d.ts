type StorageResponse = {
    requestId: number;
    success: boolean;
    message: string;
    value?: string;
};
export declare const initialiseUserState: (iframeUrl: string) => Promise<unknown>;
export declare const storeUserState: (key: string, value: string) => Promise<StorageResponse>;
export declare const retrieveUserState: (key: string) => Promise<string | undefined>;
export {};
//# sourceMappingURL=index.d.ts.map