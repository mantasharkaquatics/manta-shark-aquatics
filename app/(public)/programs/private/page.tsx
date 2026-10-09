import { liveMarketingMetadata } from '@/lib/marketing-metadata'
import ProgramDetail from '../ProgramDetail'

// {place} in the title follows the pools open to families (lib/marketing-metadata.ts).
export const revalidate = 300

export async function generateMetadata() {
  return liveMarketingMetadata('programsPrivate', '/programs/private')
}

export default function ProgramsPrivatePage() {
  return <ProgramDetail kind="private" />
}
