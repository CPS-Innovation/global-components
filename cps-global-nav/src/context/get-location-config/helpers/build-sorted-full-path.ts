export const buildSortedFullPath = ({ pathname, hash, search }: Location) => {
  const urlParams = new URLSearchParams(search);
  urlParams.sort();
  return `${pathname}${urlParams.size ? "?" : ""}${urlParams.toString()}${hash || ""}`;
};
