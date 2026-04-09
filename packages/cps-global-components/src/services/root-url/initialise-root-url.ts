type Register = (arg: { rootUrl: string }) => void;

export const initialiseRootUrl = ({ register }: { register: Register }) => {
  const rootUrl = import.meta.url;
  register({ rootUrl });
  return rootUrl;
};
