import { PublicClientApplication } from "@azure/msal-browser";

export const msal = async (tenantId: string, clientId: string) => {
  try {
    const instance = new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri: "https://sacpsglobalcomponents.z33.web.core.windows.net/home",
        postLogoutRedirectUri: "/",
      },
      cache: {
        cacheLocation: "sessionStorage",
      },
    });

    await instance.initialize();

    const accounts = instance.getAllAccounts();
    console.log(accounts);
    if (accounts.length > 0) {
      instance.setActiveAccount(accounts[0]);

      // Try to silently acquire token for your API
      const tokenRequest = {
        scopes: ["https://graph.microsoft.com/User.Read"],
        account: accounts[0],
        forceRefresh: false,
      };

      const response = await instance.acquireTokenSilent(tokenRequest);
      console.log(response);
    } else {
      console.log("No accounts");
    }
  } catch (err) {
    // Silent auth failed - could be consent needed, expired tokens, etc.
    console.log("Silent auth failed:", err);
  }
};
