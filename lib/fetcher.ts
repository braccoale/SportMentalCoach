/** Shared SWR fetcher for client components. */
export const fetcher = (url: string) => fetch(url).then((res) => res.json());
