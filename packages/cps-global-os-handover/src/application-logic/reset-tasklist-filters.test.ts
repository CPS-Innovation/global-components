import { describe, test, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { resetTasklistFilters } from "./reset-tasklist-filters";

describe("resetTasklistFilters", () => {
  let storage: Record<string, string>;
  let removeItem: jest.Mock;
  let mockWindow: Window;

  beforeEach(() => {
    storage = {};
    removeItem = jest.fn((key: string) => {
      delete storage[key];
    }) as unknown as jest.Mock;
    mockWindow = {
      localStorage: {
        removeItem,
      },
    } as unknown as Window;
  });

  test("removes all known tasklist filter keys from localStorage", () => {
    const keys = [
      "$OS_Users$WorkManagementApp$ClientVars$ChosenAreaAPI",
      "$OS_Users$WorkManagementApp$ClientVars$ChosenCourtAPI",
      "$OS_Users$WorkManagementApp$ClientVars$TaskFilters_Court",
      "$OS_Users$WorkManagementApp$ClientVars$ChosenOwnerAPI",
      "$OS_Users$WorkManagementApp$ClientVars$TaskFilters_TaskType",
      "$OS_Users$WorkManagementApp$ClientVars$TaskFilters_Unit",
      "$OS_Users$WorkManagementApp$ClientVars$TaskFilters_URN",
      "$OS_Users$WorkManagementApp$ClientVars$ViewState",
      "$OS_Users$WorkManagementApp$ClientVars$AlertSuccessText",
      "$OS_Users$WorkManagementApp$ClientVars$showAlertSuccess",
      "$OS_Users$WorkManagementApp$ClientVars$AlertWarningText",
      "$OS_Users$WorkManagementApp$ClientVars$showAlertWarning",
      "$OS_Users$WorkManagementApp$ClientVars$PriorityChargingFilters_Unit",
      "$OS_Users$WorkManagementApp$ClientVars$PriorityChargingFilters_Area2",
      "$OS_Users$WorkManagementApp$ClientVars$TaskFilters_Owner",
      "$OS_Users$WorkManagementApp$ClientVars$AlertSuccessTextAdditional",
      "$OS_Users$WorkManagementApp$ClientVars$CaseFilters_HearingDate",
      "$OS_Users$WorkManagementApp$ClientVars$CaseFilters_HearingDays",
      "$OS_Users$WorkManagementApp$ClientVars$CaseFilters_URN",
      "$OS_Users$WorkManagementApp$ClientVars$CaseFilters_HearingTypeCode",
      "$OS_Users$WorkManagementApp$ClientVars$TaskFilters_HearingDays",
      "$OS_Users$WorkManagementApp$ClientVars$TaskFilters_HearingDate",
      "$OS_Users$WorkManagementApp$ClientVars$PriorityChargingFilters_URN",
      "$OS_Users$WorkManagementApp$ClientVars$PriorityChargingFilters_Owner",
      "$OS_Users$WorkManagementApp$ClientVars$TaskFilters_UnitGroup",
      "$OS_Users$WorkManagementApp$ClientVars$PriorityChargingFilters_FilterTagSetId",
      "$OS_Users$WorkManagementApp$ClientVars$CaseFilters_FilterTagSetId",
      "$OS_Users$WorkManagementApp$ClientVars$TaskFilters_FilterTagSetId",
      "$OS_Users$WorkManagementApp$ClientVars$TaskFilters_OwnerDisplay",
      "$OS_Users$WorkManagementApp$ClientVars$TaskFilters_AdditionalOwners",
      "$OS_Users$WorkManagementApp$ClientVars$TaskFilters_UnitDisplay",
      "$OS_Users$WorkManagementApp$ClientVars$PriorityChargingFilters_AreaDisplay",
      "$OS_Users$WorkManagementApp$ClientVars$Directions_Areas",
      "$OS_Users$WorkManagementApp$ClientVars$Directions_Assignees",
      "$OS_Users$WorkManagementApp$ClientVars$Directions_Caseworkers",
      "$OS_Users$WorkManagementApp$ClientVars$Directions_DateDisplay",
      "$OS_Users$WorkManagementApp$ClientVars$Directions_EndDate",
      "$OS_Users$WorkManagementApp$ClientVars$Directions_Prosecutors",
      "$OS_Users$WorkManagementApp$ClientVars$Directions_StartDate",
      "$OS_Users$WorkManagementApp$ClientVars$Directions_Units",
      "$OS_Users$WorkManagementApp$ClientVars$Directions_URN",
      "$OS_Users$WorkManagementApp$ClientVars$TriageFilters_AdditionalOwners",
      "$OS_Users$WorkManagementApp$ClientVars$TriageFilters_CPSAreaDisplay",
      "$OS_Users$WorkManagementApp$ClientVars$TriageFilters_CPSAreaId",
      "$OS_Users$WorkManagementApp$ClientVars$TriageFilters_FilterTagSetId",
      "$OS_Users$WorkManagementApp$ClientVars$TriageFilters_Owner",
      "$OS_Users$WorkManagementApp$ClientVars$TriageFilters_OwnerDisplay",
      "$OS_Users$WorkManagementApp$ClientVars$TriageFilters_Unit",
      "$OS_Users$WorkManagementApp$ClientVars$TriageFilters_UnitDisplay",
      "$OS_Users$WorkManagementApp$ClientVars$TriageFilters_URN",
    ];
    keys.forEach((key) => {
      storage[key] = "some-value";
    });

    resetTasklistFilters(mockWindow);

    keys.forEach((key) => {
      expect(removeItem).toHaveBeenCalledWith(key);
      expect(storage[key]).toBeUndefined();
    });
  });

  test("does not remove keys that are not in the reset list", () => {
    storage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = "preserve-me";
    storage["$OS_Users$WorkManagementApp$ClientVars$JSONString"] = "preserve-me-too";
    storage["unrelated-key"] = "also-preserve";

    resetTasklistFilters(mockWindow);

    expect(storage["$OS_Users$WorkManagementApp$ClientVars$Cookies"]).toBe("preserve-me");
    expect(storage["$OS_Users$WorkManagementApp$ClientVars$JSONString"]).toBe("preserve-me-too");
    expect(storage["unrelated-key"]).toBe("also-preserve");
    expect(removeItem).not.toHaveBeenCalledWith("$OS_Users$WorkManagementApp$ClientVars$Cookies");
    expect(removeItem).not.toHaveBeenCalledWith("$OS_Users$WorkManagementApp$ClientVars$JSONString");
    expect(removeItem).not.toHaveBeenCalledWith("unrelated-key");
  });

  test("calls removeItem even for keys that are not present in storage", () => {
    resetTasklistFilters(mockWindow);

    expect(removeItem).toHaveBeenCalledWith("$OS_Users$WorkManagementApp$ClientVars$TaskFilters_URN");
    expect(removeItem).toHaveBeenCalledWith("$OS_Users$WorkManagementApp$ClientVars$TriageFilters_URN");
    expect(removeItem).toHaveBeenCalledWith("$OS_Users$WorkManagementApp$ClientVars$Directions_URN");
  });

  test("removes a partially-populated subset without throwing", () => {
    storage["$OS_Users$WorkManagementApp$ClientVars$TaskFilters_URN"] = "ABC";
    storage["$OS_Users$WorkManagementApp$ClientVars$TriageFilters_URN"] = "XYZ";

    resetTasklistFilters(mockWindow);

    expect(storage["$OS_Users$WorkManagementApp$ClientVars$TaskFilters_URN"]).toBeUndefined();
    expect(storage["$OS_Users$WorkManagementApp$ClientVars$TriageFilters_URN"]).toBeUndefined();
  });

  test("invokes removeItem exactly once per key in the reset list", () => {
    resetTasklistFilters(mockWindow);

    const calledKeys = removeItem.mock.calls.map((call) => call[0]);
    const uniqueCalledKeys = new Set(calledKeys);

    expect(calledKeys.length).toBe(uniqueCalledKeys.size);
    expect(removeItem).toHaveBeenCalledTimes(50);
  });

  describe("when localStorage.removeItem throws", () => {
    let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    test("swallows the error instead of propagating", () => {
      const throwingWindow = {
        localStorage: {
          removeItem: () => {
            throw new Error("storage unavailable");
          },
        },
      } as unknown as Window;

      expect(() => resetTasklistFilters(throwingWindow)).not.toThrow();
    });

    test("logs the error to console.error with a recognisable prefix", () => {
      const throwingWindow = {
        localStorage: {
          removeItem: () => {
            throw new Error("storage unavailable");
          },
        },
      } as unknown as Window;

      resetTasklistFilters(throwingWindow);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("resetTasklistFilters error:"),
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("storage unavailable"),
      );
    });

    test("stops on the first throw and does not attempt remaining keys", () => {
      const removeItemThrowing = jest.fn(() => {
        throw new Error("boom");
      });
      const throwingWindow = {
        localStorage: { removeItem: removeItemThrowing },
      } as unknown as Window;

      resetTasklistFilters(throwingWindow);

      expect(removeItemThrowing).toHaveBeenCalledTimes(1);
    });
  });
});
