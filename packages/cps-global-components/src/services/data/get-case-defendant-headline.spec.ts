import { getCaseDefendantHeadline } from "./get-case-defendant-headline";
import { CaseDetails } from "./CaseDetails";

describe("getCaseDefendantHeadline", () => {
  const createCaseDetails = (overrides: Partial<CaseDetails> = {}): CaseDetails => ({
    id: 1,
    urn: "12AB3456789",
    isDcfCase: false,
    leadDefendantFirstNames: "John",
    leadDefendantSurname: "Smith",
    leadDefendantType: "Person",
    numberOfDefendants: 1,
    ...overrides,
  });

  it("should return surname and first names for a single defendant", () => {
    const caseDetails = createCaseDetails({
      leadDefendantSurname: "Smith",
      leadDefendantFirstNames: "John",
      numberOfDefendants: 1,
    });

    const result = getCaseDefendantHeadline(caseDetails);

    expect(result).toBe("Smith, John");
  });

  it("should append 'and 1 other' for two defendants", () => {
    const caseDetails = createCaseDetails({
      leadDefendantSurname: "Jones",
      leadDefendantFirstNames: "Jane",
      numberOfDefendants: 2,
    });

    const result = getCaseDefendantHeadline(caseDetails);

    expect(result).toBe("Jones, Jane  and 1 other");
  });

  it("should append 'and 2 others' for three defendants", () => {
    const caseDetails = createCaseDetails({
      leadDefendantSurname: "Brown",
      leadDefendantFirstNames: "Bob",
      numberOfDefendants: 3,
    });

    const result = getCaseDefendantHeadline(caseDetails);

    expect(result).toBe("Brown, Bob  and 2 others");
  });

  it("should append 'and 9 others' for ten defendants", () => {
    const caseDetails = createCaseDetails({
      leadDefendantSurname: "Wilson",
      leadDefendantFirstNames: "William",
      numberOfDefendants: 10,
    });

    const result = getCaseDefendantHeadline(caseDetails);

    expect(result).toBe("Wilson, William  and 9 others");
  });

  it("should handle zero defendants", () => {
    const caseDetails = createCaseDetails({
      leadDefendantSurname: "Taylor",
      leadDefendantFirstNames: "Tom",
      numberOfDefendants: 0,
    });

    const result = getCaseDefendantHeadline(caseDetails);

    expect(result).toBe("Taylor, Tom");
  });

  it("should handle multiple first names", () => {
    const caseDetails = createCaseDetails({
      leadDefendantSurname: "Davies",
      leadDefendantFirstNames: "David James",
      numberOfDefendants: 1,
    });

    const result = getCaseDefendantHeadline(caseDetails);

    expect(result).toBe("Davies, David James");
  });

  it("should handle hyphenated surnames", () => {
    const caseDetails = createCaseDetails({
      leadDefendantSurname: "Smith-Jones",
      leadDefendantFirstNames: "Sarah",
      numberOfDefendants: 2,
    });

    const result = getCaseDefendantHeadline(caseDetails);

    expect(result).toBe("Smith-Jones, Sarah  and 1 other");
  });
});
