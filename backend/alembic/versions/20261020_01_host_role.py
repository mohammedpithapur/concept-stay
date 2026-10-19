"""add host role and host_status to users

Revision ID: 20261020_01_host_role
Revises: 20260903_03_articles
"""
from alembic import op
import sqlalchemy as sa

revision = '20261020_01_host_role'
down_revision = '20260903_03_articles'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'host'")
    host_status = sa.Enum('pending', 'approved', 'suspended', name='hoststatus')
    host_status.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'users',
        sa.Column('host_status', sa.Enum('pending', 'approved', 'suspended', name='hoststatus', create_type=False),
                  server_default='approved', nullable=False),
    )


def downgrade() -> None:
    op.drop_column('users', 'host_status')
    sa.Enum(name='hoststatus').drop(op.get_bind(), checkfirst=True)
