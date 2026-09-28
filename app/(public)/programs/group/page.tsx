import { marketingMetadata } from '@/lib/marketing-metadata'
import ProgramDetail from '../ProgramDetail'

export const metadata = marketingMetadata('programsGroup', '/programs/group')

export default function ProgramsGroupPage() {
  return <ProgramDetail kind="group" />
}
