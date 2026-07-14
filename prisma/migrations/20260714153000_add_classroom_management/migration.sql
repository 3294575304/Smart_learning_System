-- Distinguish a voluntary leave from a teacher removal. This prevents a
-- removed student from immediately rejoining with the same invite code.
ALTER TYPE "MembershipStatus" ADD VALUE 'LEFT' BEFORE 'REMOVED';
