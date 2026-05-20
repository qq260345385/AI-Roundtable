import { NextResponse } from "next/server";
import { createProviderRegistry } from "../../../lib/providers/provider-registry";

export async function GET() {
  try {
    const registry = await createProviderRegistry(undefined, {
      allowEmptyRealMode: true,
    });

    return NextResponse.json({
      mode: registry.mode,
      models: registry.participants,
      unavailableProviders: registry.unavailableProviders,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}
