import { withLogging } from "../../logging/with-logging";

const isLocalDevelopmentInternal = ({ location: { href } }: { location: { href: string } }) => href.startsWith("http://localhost") || href.includes("devtunnels.ms");

export const isLocalDevelopment = withLogging("isLocalDevelopment", isLocalDevelopmentInternal);
