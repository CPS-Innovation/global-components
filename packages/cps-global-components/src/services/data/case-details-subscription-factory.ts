import { Config } from "cps-global-configuration";
import { getCaseDetailsFactory } from "./get-case-details-factory";
import { LocalStorageCache } from "../cache/create-cache";
import { caseDetailsSafeToCacheFields, CaseDetailsSchema } from "./CaseDetails";
import { extractTagsFromCaseDetails } from "./extract-tags-from-case-details";
import { SubscriptionFactory } from "../../store/subscriptions/SubscriptionFactory";
import { Handover } from "../handover/Handover";

type Props = {
  config: Config;
  cache: LocalStorageCache;
  handover: Handover;
  fetch: typeof fetch;
};

export const caseDetailsSubscriptionFactory = ({ config, cache, fetch }: Props): SubscriptionFactory => {
  const getCaseDetails = getCaseDetailsFactory(fetch);
  const caseDetailsCache = cache.createEntityCache("case-details", CaseDetailsSchema, { cacheableFields: caseDetailsSafeToCacheFields, ...config.CACHE_CONFIG });

  // if (handover.found) {
  //   const caseDetails = handover.data.caseDetails
  //   caseDetailsCache.set()
  // }

  return ({ register, mergeTags }) => ({
    type: "onChange",
    handler: {
      propName: "caseIdentifiers",
      handler: caseIdentifiers => {
        if (!caseIdentifiers) {
          return;
        }

        caseDetailsCache
          .fetch(caseIdentifiers.caseId, id => getCaseDetails(id), { fields: ["urn", "isDcfCase"] })
          .then(caseDetails => {
            mergeTags({ caseDetailsTags: extractTagsFromCaseDetails(caseDetails).tags });
            register({ caseDetails });
          });
      },
    },
  });
};
