import { marketingMetadata } from '@/lib/marketing-metadata'
import ProgramDetail from '../ProgramDetail'

export const metadata = marketingMetadata('programsPrivate', '/programs/private')

export default function ProgramsPrivatePage() {
  return <ProgramDetail kind="private" />
}
