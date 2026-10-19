"""verified-guest review categories

Revision ID: 20261020_04_review_categories
Revises: 20261020_03_payout_ledger
"""
from alembic import op
import sqlalchemy as sa

revision = '20261020_04_review_categories'
down_revision = '20261020_03_payout_ledger'
branch_labels = None
depends_on = None

CATEGORIES = ('cleanliness', 'location', 'comfort', 'hospitality', 'accuracy')


def upgrade() -> None:
    for col in CATEGORIES:
        op.add_column('reviews', sa.Column(col, sa.Integer(), nullable=True))
    op.add_column('reviews', sa.Column('would_recommend', sa.Boolean(), nullable=True))
    op.create_unique_constraint('uq_reviews_booking_id', 'reviews', ['booking_id'])


def downgrade() -> None:
    op.drop_constraint('uq_reviews_booking_id', 'reviews', type_='unique')
    op.drop_column('reviews', 'would_recommend')
    for col in reversed(CATEGORIES):
        op.drop_column('reviews', col)
