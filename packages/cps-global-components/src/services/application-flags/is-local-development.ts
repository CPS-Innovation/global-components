import { withLogging } from "../../logging/with-logging";

const isLocalDevelopmentInternal = ({ location: { href } }: { location: { href: string } }) => href.startsWith("http://localhost");

export const isLocalDevelopment = withLogging("isLocalDevelopment", isLocalDevelopmentInternal);
