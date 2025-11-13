import { MergeTags, Register } from "../../store/store";
import { extractCaseIdentifiersIfChanged } from "./extract-case-identifiers-if-changed";
import { CaseIdentifiers } from "../context/CaseIdentifiers";
import { getCaseDetails, GetCaseDetailsProps } from "./get-case-details";
import { SubscriptionFactory } from "../../store/subscriptions/SubscriptionFactory";
import { Tags } from "@microsoft/applicationinsights-web";
import { GetToken } from "../auth/GetToken";
import { CorrelationIds } from "../correlation/CorrelationIds";
import { _console } from "../../logging/_console";
import { FoundContext } from "../context/FoundContext";
import { LocalStorageCache } from "../cache/create-cache";
import { caseDetailsSafeToCacheFields, CaseDetailsSchema } from "./CaseDetails";
import { extractTagsFromCaseDetails } from "./extract-tags-from-case-details";

export const getCaseDetailsSubscriptionFactory =
  ({
    register,
    mergeTags,
    getToken,
    config,
    context,
    correlationIds,
    window,
    cache,
  }: {
    register: Register;
    mergeTags: MergeTags;
    getToken: GetToken;
    config: GetCaseDetailsProps["config"];
    context: FoundContext;
    correlationIds: CorrelationIds;
    window: Window;
    cache: LocalStorageCache;
  }): SubscriptionFactory =>
  () => {
    let lastKnownCaseIdentifier: CaseIdentifiers | undefined = undefined;

    const caseDetailsCache = cache.createEntityCache("case-details", CaseDetailsSchema, { cacheableFields: caseDetailsSafeToCacheFields, ...config.CACHE_CONFIG });

    return {
      // Trigger on creation as the store may have the tags prior to being created,
      //  and hence no onchange event wil happen in order to run this logic
      triggerSetOnCreation: { key: "tags" },
      subscription: {
        set: (key, newValue) => {
          if (key === "tags") {
            const caseIdentifiers = extractCaseIdentifiersIfChanged(lastKnownCaseIdentifier, newValue as Tags);
            _console.debug("getCaseDetailsSubscription", "caseIdentifiers", caseIdentifiers);
            if (!caseIdentifiers) {
              return;
            }

            mergeTags({ caseDetailsTags: extractTagsFromCaseDetails(caseDetailsCache.get(caseIdentifiers.caseId)) });

            lastKnownCaseIdentifier = caseIdentifiers;
            caseDetailsCache
              .fetch(lastKnownCaseIdentifier.caseId, () => getCaseDetails({ window, caseIdentifiers, getToken, config, context, correlationIds }))
              .then(caseDetails => {
                register({ caseDetails });
                mergeTags({ caseDetailsTags: extractTagsFromCaseDetails(caseDetails) });
              });
          }
        },
      },
    };
  };
