import { marketingMetadata } from '@/lib/marketing-metadata'
import ProgramDetail from '../ProgramDetail'

export const metadata = marketingMetadata('programsTeam', '/programs/team')

export default function ProgramsTeamPage() {
  return <ProgramDetail kind="team" />
}
